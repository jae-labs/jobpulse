function cleanWhitespace(text: string): string {
  let s = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, ' ');
  s = s.replace(/[^\S\n]+$/gm, '');
  s = s.replace(/^[ \t]*[•·\u2022\u2023\u25E6\u2043\u2219][ \t]*[•·\u2022\u2023\u25E6\u2043\u2219]+[ \t]*/gm, '• ');
  s = s.replace(/(?:•\s*){2,}/g, '• ');
  s = s.replace(/^[ \t]*[-*·][ \t]+/gm, '• ');
  s = s.replace(/\n{2,}[ \t]*•/g, '\n• ');
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

export function formatJobDescription(rawText: string | null | undefined): string {
  if (!rawText) return '';
  let s = cleanWhitespace(rawText);

  const newlineCount = (s.match(/\n/g) || []).length;
  if (newlineCount >= 8) {
    return cleanWhitespace(s);
  }

  s = s.replace(/[\u2022\u2023\u25E6\u2043\u2219•]\s*/g, '\n• ');

  const HEADERS = [
    'Company Description',
    'Corporate Security Responsibility',
    'Information Security',
    'Security Responsibilities',
    'Equal Opportunity Employer',
    'Equal Opportunity',
    'Diversity & Inclusion',
    'Diversity and Inclusion',
    'Core Competencies',
    'Personal Attributes',
    'Skills & Experience',
    'Skills and Experience',
    'Skills & Requirements',
    'Key Responsibilities',
    'Core Responsibilities',
    'Primary Responsibilities',
    'Role & Responsibilities',
    'Responsibilities',
    'Qualifications Required',
    'Required Qualifications',
    'Minimum Qualifications',
    'Basic Qualifications',
    'Essential Requirements',
    'Qualifications',
    'Requirements',
    'Preferred Qualifications',
    'Preferred Requirements',
    'Preferred',
    'What You’ll Do',
    "What You'll Do",
    'What You Will Do',
    'What You’ll Need',
    "What You'll Need",
    'What You Will Need',
    'You Will Need',
    'What You’ll Bring',
    "What You'll Bring",
    'All about you',
    'About you',
    'Who You Are',
    'Who we are looking for',
    'Ideal Candidate',
    'What We Offer',
    'Benefits & Perks',
    'Perks & Benefits',
    'Salary & Benefits',
    'Compensation',
    'Benefits',
    'Work Environment',
    'Work Mode & Location',
    'Application Process',
    'How to Apply',
    'Our Purpose',
    'Our Mission',
    'Company Overview',
    'About The Company',
    'About The Role',
    'About The Team',
    'About Us',
    'Job Overview',
    'Role Overview',
    'Overview',
    'Job Summary',
    'Role Summary',
    'Position Summary',
    'Title and Summary',
    'The Role',
    'Role',
  ];

  const SORTED_HEADERS = [...HEADERS].sort((a, b) => b.length - a.length);
  const HEADERS_REGEX = new RegExp(
    `(?:([.!?])|([a-z0-9)]))\\s+\\b(${SORTED_HEADERS.map((h) => h.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')).join('|')})\\b\\s*(:)?\\s*`,
    'gi'
  );

  s = s.replace(HEADERS_REGEX, (match, punct, wordEnd, title, colon) => {
    if (!colon && title[0] && title[0] !== title[0].toUpperCase()) {
      return match;
    }
    const p = punct || (wordEnd ? `${wordEnd}.` : '');
    const cleanTitle = title === title.toUpperCase() ? title.charAt(0) + title.slice(1).toLowerCase() : title;
    return `${p}\n\n${cleanTitle}:\n`;
  });

  s = s.replace(/;\s+([A-Z][a-z]+)/g, ';\n• $1');

  s = s.replace(/([^\n])\s*•\s*/g, '$1\n• ');

  s = s.replace(/^\s*[:.]\s*/gm, '');

  return cleanWhitespace(s);
}
