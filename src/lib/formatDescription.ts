/**
 * Normalizes all whitespace, carriage returns, invisible characters,
 * and collapses excessive blank lines down to a clean single blank line (\n\n).
 */
function cleanWhitespace(text: string): string {
  let s = text;

  // 1. Convert common HTML breaks and entities if present in scraped text
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  // 2. Normalize Windows/Mac carriage returns to standard newline
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Normalize non-breaking spaces and special unicode whitespaces
  s = s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, ' ');

  // 4. Strip trailing spaces/tabs on each line (turns whitespace-only lines into truly empty lines)
  s = s.replace(/[^\S\n]+$/gm, '');

  // 5. Clean up redundant consecutive bullet symbols (e.g. "• • Full-time", "· •", "•  •")
  s = s.replace(/^[ \t]*[•·\u2022\u2023\u25E6\u2043\u2219][ \t]*[•·\u2022\u2023\u25E6\u2043\u2219]+[ \t]*/gm, '• ');
  s = s.replace(/(?:•\s*){2,}/g, '• ');

  // 6. Fix tight bullet points in structured text: convert start-of-line hyphens/stars to bullets
  s = s.replace(/^[ \t]*[-*·][ \t]+/gm, '• ');

  // 7. Ensure bullet points don't have large blank gaps between each other
  s = s.replace(/\n{2,}[ \t]*•/g, '\n• ');

  // 8. Collapse any sequence of 3 or more newlines (excessive blank lines) down to exactly 2 newlines
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

/**
 * Intelligently formats squashed or unformatted job descriptions:
 * - Restores paragraph breaks for section titles (e.g. "Role:", "Qualifications:", "Requirements:", "Our Purpose", etc.)
 * - Formats bullet lists onto dedicated lines with clean bullet symbols
 * - Cleans up multiple spaces, irregular punctuation, and excessive blank lines
 */
export function formatJobDescription(rawText: string | null | undefined): string {
  if (!rawText) return '';
  let s = cleanWhitespace(rawText);

  // If text already has plenty of newlines (structured source), return cleanly normalized text
  const newlineCount = (s.match(/\n/g) || []).length;
  if (newlineCount >= 8) {
    return cleanWhitespace(s);
  }

  // 1. Normalize bullet characters to standard bullet and ensure newline before bullets
  s = s.replace(/[\u2022\u2023\u25E6\u2043\u2219•]\s*/g, '\n• ');

  // 2. Common section headers to detect and break into separate paragraphs
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

  for (const h of HEADERS) {
    const esc = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match header preceded by sentence end (. ! ?) OR end of word/closing paren
    const regex = new RegExp(`(?:([.!?])|([a-z0-9)]))\\s+\\b(${esc})\\b\\s*(:)?\\s*`, 'gi');
    s = s.replace(regex, (_, punct, wordEnd, title) => {
      const p = punct || (wordEnd ? `${wordEnd}.` : '');
      return `${p}\n\n${title}:\n`;
    });
  }

  // 3. Semicolons followed by capital letters in bulleted lists (e.g. "; Ensure...")
  s = s.replace(/;\s+([A-Z][a-z]+)/g, ';\n• $1');

  // 4. Ensure bullet points always start on their own line
  s = s.replace(/([^\n])\s*•\s*/g, '$1\n• ');

  // 5. Clean up leading punctuation glitches
  s = s.replace(/^\s*[:.]\s*/gm, '');

  // 6. Final clean pass to ensure all whitespace and excessive blank lines are collapsed
  return cleanWhitespace(s);
}
