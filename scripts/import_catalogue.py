"""Fetch official catalogue facts; dependency rules are reviewed separately.

Usage: python scripts/import_catalogue.py
Requires beautifulsoup4 (scripts/requirements.txt). Never runs in the web app.
"""
import concurrent.futures
import datetime
import json
import re
import urllib.request
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
    course.update(requirements=requirements, offerings=offerings, checkedOn=datetime.date.today().isoformat())
    return course

def main():
    page = fetch(OUTLINE)
    courses = {}
    for li in page.select('li'):
        link = li.select_one('.course-title a')
        if not link:
            continue
        match = re.fullmatch(r'(.+), ([\d.]+) credits \((\w+)\)', clean(link))
        if not match:
            raise ValueError(f'Unexpected outline title: {clean(link)}')
        title, credits, code = match.groups()
        heading = li.find_previous('h2')
        semester = int(re.search(r'\d+', clean(heading)).group())
        track = clean(li.find_previous('h3'))
        c = courses.setdefault(code, {'id': code, 'title': title, 'credits': float(credits), 'source': 'https://www.uu.se' + link['href'], 'outline': []})
        periods = []
        for period in li.select('.period-grid .active'):
            m = re.fullmatch(r'Semester \d+, period (\d+): ([\d.]+) credits', clean(period))
            if not m:
                raise ValueError(f'Unexpected period: {clean(period)}')
            periods.append({'period': int(m[1]), 'credits': float(m[2])})
        description = li.select_one('.description')
        c['outline'].append({'semester': semester, 'group': track, 'periods': periods, 'note': clean(description) if description else ''})
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        detailed = list(pool.map(course_detail, courses.values()))
    output = {'programme': "Master’s Programme in Mathematics", 'code': 'TMA2M', 'credits': 120, 'validFrom': 'Autumn 2026', 'outlineSource': OUTLINE, 'checkedOn': datetime.date.today().isoformat(), 'courses': detailed}
    target = ROOT / 'dist' / 'catalogue.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(target)
    print(f'Imported {len(detailed)} courses. Review requirements and dependency rules before publishing.')
    for course in detailed:
        print(course['id'], course['title'], '|', ' / '.join(course['requirements']) or 'REQUIREMENTS NOT FOUND', '|', ', '.join(o['dates'] for o in course['offerings']))

if __name__ == '__main__':
    main()
