"""Fetch official catalogue facts; dependency rules are reviewed separately.

Usage: python scripts/import_catalogue.py
Requires beautifulsoup4 (scripts/requirements.txt). Never runs in the web app.
"""
import concurrent.futures
import datetime
import json
import math
import re
import urllib.request
import urllib.parse
import tempfile
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUTLINE = 'https://www.uu.se/en/study/outline?query=53757e7c-b967-4250-83db-911b32fbdfc8'

def clean(value):
    return ' '.join(value.get_text(' ', strip=True).split())

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'CourseAtlas/0.1 (course planning catalogue research)'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return BeautifulSoup(response.read(), 'html.parser')

def course_detail(course):
    page = fetch(course['source'])
    requirements, offerings = [], []
    for dl in page.select('dl.education-instance-info'):
        fields = {clean(dt): clean(dt.find_next_sibling('dd')) for dt in dl.select('dt') if dt.find_next_sibling('dd')}
        requirement = fields.get('Entry requirements')
        if requirement and requirement not in requirements:
            requirements.append(requirement)
        dates = fields.get('Study period')
        if dates and not any(o['dates'] == dates for o in offerings):
            offerings.append({'dates': dates, 'pace': fields.get('Pace of study'), 'location': fields.get('Location')})
    syllabus = next((a for a in page.select('a[href]') if 'Syllabus valid from' in clean(a)), None)
    course['syllabus'] = 'https://www.uu.se' + syllabus['href'] if syllabus and syllabus['href'].startswith('/') else (syllabus['href'] if syllabus else None)
    if not requirements and course['syllabus']:
        syllabus_page = fetch(course['syllabus'])
        for dt in syllabus_page.select('dt'):
            if 'Entry requirements' in clean(dt):
                dd = dt.find_next_sibling('dd')
                if dd:
                    requirements.append(clean(dd))
        if not requirements:
            for heading in syllabus_page.select('h2,h3'):
                if clean(heading) == 'Entry requirements':
                    parts = []
                    for sibling in heading.next_siblings:
                        if getattr(sibling, 'name', None) in ['h2', 'h3']:
                            break
                        if getattr(sibling, 'get_text', None):
                            parts.append(clean(sibling))
                    if parts:
                        requirements.append(' '.join(parts))
    requirements = list(dict.fromkeys(' '.join(requirement.split()) for requirement in requirements if requirement.strip()))
    if not requirements:
        raise ValueError(f"{course['id']}: official entry requirements not found; refusing to publish an incomplete snapshot")
    course.update(requirements=requirements, offerings=offerings, checkedOn=datetime.date.today().isoformat())
    return course

def parse_outline(page):
    courses = {}
    for li in page.select('li'):
        link = li.select_one('.course-title a')
        if not link:
            continue
        match = re.fullmatch(r'(.+), ([\d.]+) credits \((\w+)\)', clean(link))
        if not match:
            raise ValueError(f'Unexpected outline title: {clean(link)}')
        title, credits, code = match.groups()
        credits = float(credits)
        if not math.isfinite(credits) or credits <= 0:
            raise ValueError(f'Invalid course credits: {code}')
        heading = li.find_previous('h2')
        group = li.find_previous('h3')
        if not heading or not re.fullmatch(r'Semester [1-4]', clean(heading)) or not group or group.find_previous('h2') is not heading:
            raise ValueError(f'Unexpected outline semester/group for {code}')
        semester = int(clean(heading).split()[-1])
        track = clean(group)
        source = urllib.parse.urljoin('https://www.uu.se',link['href'])
        parsed = urllib.parse.urlparse(source)
        if parsed.scheme != 'https' or parsed.netloc != 'www.uu.se' or parsed.path != '/en/study/course' or urllib.parse.parse_qs(parsed.query).get('query') != [code]:
            raise ValueError(f'Unexpected official course link: {code}')
        field = li.select_one('.main-field-of-study')
        if not field:
            raise ValueError(f'Missing subject/level metadata: {code}')
        field_text = clean(field).removeprefix('Main field(s) of study and in-depth level:').strip()
        subject_levels = []
        for entry in field_text.split(','):
            field_match = re.fullmatch(r'(.+?)\s+([AG][12][A-Z])',entry.strip())
            if not field_match:
                raise ValueError(f'Unexpected subject/level metadata: {code}: {entry}')
            subject_levels.append({'subject': field_match[1], 'level': field_match[2]})
        c = courses.setdefault(code, {'id': code, 'title': title, 'credits': credits, 'source': source, 'subjectLevels': subject_levels, 'outline': []})
        if c['title'] != title or c['credits'] != credits or c['subjectLevels'] != subject_levels:
            raise ValueError(f'Conflicting outline records for {code}')
        periods = []
        for period in li.select('.period-grid .active'):
            m = re.fullmatch(r'Semester (\d+), period (\d+): ([\d.]+) credits', clean(period))
            if not m:
                raise ValueError(f'Unexpected period: {clean(period)}')
            grid_semester, number, load = int(m[1]), int(m[2]), float(m[3])
            allowed_periods = [1, 2] if semester % 2 else [3, 4]
            if grid_semester != semester or number not in allowed_periods or (periods and number <= periods[-1]['period']) or not math.isfinite(load) or load <= 0:
                raise ValueError(f'Invalid outline period for {code}: {clean(period)}')
            periods.append({'period': number, 'credits': load})
        if periods and abs(sum(period['credits'] for period in periods) - credits) >= .01:
            raise ValueError(f'Outline period credits do not total course credits: {code}')
        description = li.select_one('.description')
        c['outline'].append({'semester': semester, 'group': track, 'periods': periods, 'note': clean(description) if description else ''})
    if not courses:
        raise ValueError('No courses found in the official outline; existing snapshot is unchanged')
    return courses


def main():
    courses = parse_outline(fetch(OUTLINE))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        detailed = list(pool.map(course_detail, courses.values()))
    output = {'programme': "Master’s Programme in Mathematics", 'code': 'TMA2M', 'credits': 120, 'validFrom': 'Autumn 2026', 'outlineSource': OUTLINE, 'checkedOn': datetime.date.today().isoformat(), 'courses': detailed}
    target = ROOT / 'dist' / 'catalogue.json'
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=target.parent,suffix='.tmp',delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
        temporary.replace(target)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    print(f'Imported {len(detailed)} courses. Review requirements and dependency rules before publishing.')
    for course in detailed:
        print(course['id'], course['title'], '|', ' / '.join(course['requirements']) or 'REQUIREMENTS NOT FOUND', '|', ', '.join(o['dates'] for o in course['offerings']))

if __name__ == '__main__':
    main()
