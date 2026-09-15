"""Offline importer regressions: python -m unittest discover -s scripts."""
import contextlib
import copy
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from bs4 import BeautifulSoup

spec = importlib.util.spec_from_file_location('import_catalogue', Path(__file__).with_name('import_catalogue.py'))
catalogue = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalogue)


def soup(html):
    return BeautifulSoup(html, 'html.parser')


def course_html(code='1MA001', semester=1, title='Example Course', credits=10,
                fields='Mathematics A1N, Financial Mathematics A1N', periods=None,
                group='Track: Mathematics', note=''):
    if periods is None:
        periods = [(1, 5), (2, 5)]
    grid = ''.join(f'<span class="active">Semester {semester}, period {period}: {load} credits</span>' for period, load in periods)
    return f'''<h2>Semester {semester}</h2><h3>{group}</h3><ul><li>
      <span class="course-title"><a href="/en/study/course?query={code}">{title}, {credits} credits ({code})</a></span>
      <span class="main-field-of-study">Main field(s) of study and in-depth level: {fields}</span>
      <div class="period-grid">{grid}</div><p class="description">{note}</p>
    </li></ul>'''


class OutlineParsingTests(unittest.TestCase):
    def test_subjects_repeated_outline_entries_and_unknown_periods_are_preserved(self):
        html = course_html(note='A rotation note.') + course_html(semester=3, periods=[], group='Preliminary outline 2027/2028')
        courses = catalogue.parse_outline(soup(html))
        self.assertEqual(list(courses), ['1MA001'])
        course = courses['1MA001']
        self.assertEqual(course['subjectLevels'], [
            {'subject': 'Mathematics', 'level': 'A1N'},
            {'subject': 'Financial Mathematics', 'level': 'A1N'},
        ])
        self.assertEqual(course['credits'], 10)
        self.assertEqual([entry['semester'] for entry in course['outline']], [1, 3])
        self.assertEqual(course['outline'][0]['note'], 'A rotation note.')
        self.assertEqual(course['outline'][1]['periods'], [])

    def test_basic_level_and_explicit_any_period_group_survive_parsing(self):
        course = catalogue.parse_outline(soup(course_html(fields='Mathematics G2F', semester=3, periods=[], group='Courses that can be given in any period during the programmen.')))['1MA001']
        self.assertEqual(course['subjectLevels'], [{'subject': 'Mathematics', 'level': 'G2F'}])
        self.assertIn('any period', course['outline'][0]['group'])

    def test_conflicting_repeated_courses_are_rejected(self):
        for changes in ({'title': 'Different Course'}, {'credits': 5, 'periods': [(1, 5)]}, {'fields': 'Mathematics A1F'}):
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, 'Conflicting'):
                catalogue.parse_outline(soup(course_html() + course_html(**changes)))

    def test_empty_and_malformed_outline_pages_are_rejected(self):
        valid = course_html()
        malformed = [
            '<html><h1>Service unavailable</h1></html>',
            valid.replace('Example Course, 10 credits (1MA001)', 'Unexpected title format'),
            valid.replace('Semester 1</h2>', 'Semester 5</h2>'),
            valid.replace('<h3>Track: Mathematics</h3>', ''),
            valid.replace('class="main-field-of-study"', 'class="missing-metadata"'),
            valid.replace('Mathematics A1N', 'Mathematics unknown'),
            valid.replace('/en/study/course?query=1MA001', 'https://example.com/en/study/course?query=1MA001'),
            valid.replace('/en/study/course?query=1MA001', 'https://user@www.uu.se/en/study/course?query=1MA001'),
            valid.replace('/en/study/course?query=1MA001', 'https://www.uu.se:8443/en/study/course?query=1MA001'),
            valid.replace('/en/study/course?query=1MA001', '/en/study/course?query=1MA002'),
            course_html(credits=0, periods=[]),
            course_html(periods=[(1, 5)]),
            course_html(periods=[(1, 5), (1, 5)]),
            course_html(periods=[(2, 5), (1, 5)]),
            course_html(periods=[(5, 10)]),
            course_html(periods=[(3, 10)]),
            valid.replace('Semester 1, period 1', 'Semester 3, period 1'),
            valid.replace('period 1: 5 credits', 'period 1: 0 credits'),
            course_html() + course_html(semester=3, periods=[]).replace('<h3>Track: Mathematics</h3>', ''),
        ]
        for html in malformed:
            with self.subTest(html=html), self.assertRaises(ValueError):
                catalogue.parse_outline(soup(html))


class SnapshotPreservationTests(unittest.TestCase):
    def test_missing_official_requirements_fail_course_detail(self):
        course = next(iter(catalogue.parse_outline(soup(course_html())).values()))
        with mock.patch.object(catalogue, 'fetch', return_value=soup('<h1>No course information</h1>')):
            with self.assertRaisesRegex(ValueError, 'entry requirements not found'):
                catalogue.course_detail(course)

    def test_an_empty_syllabus_section_is_not_accepted_as_a_requirement(self):
        course_page = soup('<a href="/en/study/syllabus?query=example">Syllabus valid from Autumn 2026</a>')
        for syllabus in ('<h2>Entry requirements</h2><p> </p><h2>Content</h2>', '<dl><dt>Entry requirements</dt><dd> </dd></dl>'):
            course = next(iter(catalogue.parse_outline(soup(course_html())).values()))
            with self.subTest(syllabus=syllabus), mock.patch.object(catalogue, 'fetch', side_effect=[course_page, soup(syllabus)]):
                with self.assertRaisesRegex(ValueError, 'entry requirements not found'):
                    catalogue.course_detail(course)

    def test_a_failed_course_fetch_preserves_existing_snapshot_and_leaves_no_temporary_file(self):
        outline = soup(course_html() + course_html(code='1MA002'))

        def detail(course):
            if course['id'] == '1MA002':
                raise RuntimeError('Simulated upstream failure')
            return dict(course, requirements=['Existing requirement'], offerings=[])

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / 'dist' / 'catalogue.json'
            target.parent.mkdir()
            original = b'{"existing": "snapshot must survive"}\n'
            target.write_bytes(original)
            with mock.patch.object(catalogue, 'ROOT', root), mock.patch.object(catalogue, 'fetch', return_value=outline), mock.patch.object(catalogue, 'course_detail', side_effect=detail):
                with self.assertRaisesRegex(RuntimeError, 'upstream failure'):
                    catalogue.main()
            self.assertEqual(target.read_bytes(), original)
            self.assertEqual(list(target.parent.iterdir()), [target])

    def test_a_complete_fetch_atomically_replaces_the_snapshot_and_preserves_metadata(self):
        outline = soup(course_html())
        def detail(course):
            return dict(copy.deepcopy(course), requirements=['60 credits in mathematics.'], offerings=[], checkedOn='2026-09-15')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / 'dist' / 'catalogue.json'
            target.parent.mkdir()
            target.write_text('{"old": true}')
            with mock.patch.object(catalogue, 'ROOT', root), mock.patch.object(catalogue, 'fetch', return_value=outline), mock.patch.object(catalogue, 'course_detail', side_effect=detail), contextlib.redirect_stdout(io.StringIO()):
                catalogue.main()
            output = json.loads(target.read_text())
            self.assertEqual(output['courses'][0]['subjectLevels'][0], {'subject': 'Mathematics', 'level': 'A1N'})
            self.assertEqual(output['courses'][0]['requirements'], ['60 credits in mathematics.'])
            self.assertEqual(list(target.parent.iterdir()), [target])


if __name__ == '__main__':
    unittest.main()
