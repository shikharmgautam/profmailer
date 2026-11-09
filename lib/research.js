import { GoogleGenAI } from '@google/genai';

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

/**
 * Call Gemini with multi-model fallback and transient error retry.
 */
async function geminiGenerate(prompt, systemInstruction = '') {
  let lastError = null;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const config = { temperature: 0.1 };
        if (systemInstruction) config.systemInstruction = systemInstruction;

        const response = await genai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config,
        });

        const text = response.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        if (text) return text;
      } catch (err) {
        lastError = err;
        // If 503 (high demand), short pause and retry or try next model
        if (err.message?.includes('503') || err.message?.includes('UNAVAILABLE')) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        break; // try next model
      }
    }
  }
  throw lastError || new Error('All model attempts failed');
}

/**
 * Live web search using DuckDuckGo HTML parser.
 * Returns array of { url, title, snippet } from real live web results.
 */
async function searchWeb(query) {
  try {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results = [];
    const blocks = html.split(/class="[^"]*result\s+results_links/);
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const linkMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      if (linkMatch) {
        let rawUrl = linkMatch[1];
        if (rawUrl.includes('uddg=')) {
          const uddg = rawUrl.match(/uddg=([^&]+)/);
          if (uddg) rawUrl = decodeURIComponent(uddg[1]);
        }
        const title = linkMatch[2].replace(/<[^>]+>/g, '').trim();
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        if (rawUrl && title && !rawUrl.includes('duckduckgo.com')) {
          results.push({ url: rawUrl, title, snippet });
        }
      }
    }
    return results.slice(0, 8);
  } catch (e) {
    console.warn('searchWeb error:', e.message);
    return [];
  }
}

function cleanAuthorName(name) {
  if (!name) return '';
  return name
    .replace(/^(?:Dr\.|Prof\.|Professor|Associate Professor|Assistant Professor)\s+/i, '')
    .trim();
}

/**
 * Fetch verified academic publications from OpenAlex (250M+ open catalog).
 */
async function fetchOpenAlexPublications(professorName, university) {
  const cleanName = cleanAuthorName(professorName);
  const nameVariants = [cleanName];
  const withoutInitial = cleanName.replace(/\b[A-Z]\b/g, '').replace(/\s+/g, ' ').trim();
  if (withoutInitial && withoutInitial !== cleanName) {
    nameVariants.push(withoutInitial);
  }

  for (const query of nameVariants) {
    try {
      const authorRes = await fetch(`https://api.openalex.org/authors?search=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (!authorRes.ok) continue;
      const authorData = await authorRes.json();
      const author = authorData.results?.[0];
      if (!author?.id) continue;

      const authorCleanId = author.id.replace('https://openalex.org/', '');
      const worksRes = await fetch(
        `https://api.openalex.org/works?filter=author.id:${authorCleanId}&per_page=6&sort=publication_year:desc`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!worksRes.ok) continue;
      const worksData = await worksRes.json();

      const publications = (worksData.results || []).map(w => ({
        title: w.title,
        authors: (w.authorships || []).map(a => a.author?.display_name).filter(Boolean),
        year: w.publication_year,
        venue: w.primary_location?.source?.display_name || 'Academic Journal / Conference',
        doi: w.doi || null,
        url: w.doi || w.primary_location?.landing_page_url || null,
        abstract_snippet: `Published in ${w.publication_year}${w.primary_location?.source?.display_name ? ` in ${w.primary_location.source.display_name}` : ''}. Cited by ${w.cited_by_count || 0} works.`,
        verified_author: true,
        source_url: w.doi || 'https://openalex.org'
      }));

      if (publications.length > 0) {
        return {
          publications,
          scholar_url: author.orcid ? `https://orcid.org/${author.orcid.replace('https://orcid.org/', '')}` : null,
          total_found: author.works_count || publications.length
        };
      }
    } catch (e) {
      console.warn('fetchOpenAlexPublications variant error:', e.message);
    }
  }

  return { publications: [], scholar_url: null, total_found: 0 };
}

/**
 * Fetch HTML content from a URL with timeout and standard browser headers.
 */
async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

function isGenericEmail(email) {
  if (!email || !email.includes('@')) return true;
  const local = email.split('@')[0].toLowerCase();
  const genericLocals = [
    'webmaster', 'admin', 'administrator', 'admissions', 'help', 'support',
    'contact', 'info', 'noreply', 'no-reply', 'office', 'wim', 'registrar',
    'security', 'feedback', 'inquiry', 'jobs', 'careers', 'dean', 'chair',
    'head', 'hod', 'department', 'enquiry', 'general', 'library', 'placement',
    'principal', 'director'
  ];
  if (genericLocals.includes(local)) return true;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(email)) return true;
  return false;
}

/**
 * Strict check that an email address truly belongs to the target professor.
 * Rejects unrelated faculty members, administrators, and generic emails.
 */
export function emailMatchesName(email, professorName) {
  if (!email || !email.includes('@') || !professorName) return false;
  if (isGenericEmail(email)) return false;

  const local = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanName = cleanAuthorName(professorName).toLowerCase();
  const tokens = cleanName.split(/[^a-z]+/).filter(t => t.length > 0);
  if (tokens.length === 0) return false;

  if (tokens.length === 1) {
    const tok = tokens[0];
    return tok.length >= 3 ? local.includes(tok) : local === tok;
  }

  const longTokens = tokens.filter(t => t.length >= 3);
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const firstInitial = first[0];
  const lastInitial = last[0];

  // 1. Direct contains of significant name parts (length >= 4 or last name)
  for (const tok of longTokens) {
    if (tok.length >= 4 || tok === last) {
      if (local.includes(tok)) return true;
    }
  }

  // 2. Initial and abbreviation combinations: e.g. "ddas", "marya", "smahapatra", "pmahapatra", "kamit"
  const patterns = [
    firstInitial + last,           // e.g. ddas, marya, akumar
    last + firstInitial,           // e.g. dasd, aryam
    first + lastInitial,           // e.g. debayand, mayanka
    lastInitial + first,           // e.g. ddebayan
    first + last,                  // e.g. debayandas, mayankarya
    last + first,                  // e.g. dasdebayan
  ];

  if (tokens.length >= 3) {
    const initials = tokens.map(t => t[0]).join('');
    patterns.push(initials);
    patterns.push(tokens[0][0] + tokens[1][0] + last);
    patterns.push(tokens[tokens.length - 2][0] + last);
  }

  for (const pat of patterns) {
    if (pat.length >= 3 && (local.includes(pat) || pat.includes(local))) {
      return true;
    }
  }

  return false;
}

/**
 * Extract email address specifically belonging to the target professor.
 * Never extract an unrelated person's email from a directory.
 */
function extractTargetProfessorEmail(html, professorName) {
  if (!html || !professorName) return null;

  const cleanName = cleanAuthorName(professorName);
  const nameTokens = cleanName.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
  if (nameTokens.length === 0) return null;

  const htmlLower = html.toLowerCase();

  // STRICT NAME CHECK:
  // If professor has 2 or more significant tokens (e.g. "Mayank Arya"),
  // ALL significant tokens must appear in the HTML to avoid confusing "Mayank Shrivastava" with "Mayank Arya".
  if (nameTokens.length >= 2) {
    const missingTokens = nameTokens.filter(tok => !htmlLower.includes(tok));
    if (missingTokens.length > 0) {
      return null;
    }
  } else {
    if (!htmlLower.includes(nameTokens[0])) return null;
  }

  function getEmailsFromSnippet(snippet) {
    const found = new Set();
    const mailtoMatches = [...snippet.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)];
    for (const m of mailtoMatches) {
      const em = m[1].toLowerCase().trim();
      if (!isGenericEmail(em)) found.add(em);
    }
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const regexMatches = [...snippet.matchAll(emailRegex)];
    for (const m of regexMatches) {
      const em = m[1].toLowerCase().trim();
      if (!isGenericEmail(em)) found.add(em);
    }
    const obfRegex = /([a-zA-Z0-9._%+-]+)\s*(?:@|\[at\]|\(at\)|&#64;)\s*([a-zA-Z0-9.-]+)\s*(?:\.|\(dot\)|\[dot\])\s*([a-zA-Z]{2,})/gi;
    const obfMatches = [...snippet.matchAll(obfRegex)];
    for (const m of obfMatches) {
      const em = `${m[1]}@${m[2]}.${m[3]}`.toLowerCase().trim();
      if (!isGenericEmail(em)) found.add(em);
    }
    return Array.from(found);
  }

  // 1. Structural Container Search (table rows, list items, faculty cards)
  const containerRegexes = [
    /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi,
    /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
    /<article\b[^>]*>([\s\S]*?)<\/article>/gi,
    /<div\b[^>]*(?:class|id)="[^"]*(?:faculty-card|person-card|profile-card|member-card|user-card|team-card|speaker-card|view-row)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  ];

  for (const regex of containerRegexes) {
    const matches = [...html.matchAll(regex)];
    for (const match of matches) {
      const containerContent = match[1];
      const containerLower = containerContent.toLowerCase();
      const allPresent = nameTokens.every(tok => containerLower.includes(tok));
      if (allPresent) {
        const containerEmails = getEmailsFromSnippet(containerContent);
        // STRICT: Only return if email truly matches the professor's name!
        const matched = containerEmails.find(em => emailMatchesName(em, professorName));
        if (matched) return matched;
      }
    }
  }

  // 2. Proximity search around full name (within 400 characters)
  const fullName = nameTokens.join(' ');
  let searchPos = 0;
  while (true) {
    const idx = htmlLower.indexOf(fullName, searchPos);
    if (idx === -1) break;
    const start = Math.max(0, idx - 400);
    const end = Math.min(html.length, idx + 400);
    const slice = html.slice(start, end);
    const sliceEmails = getEmailsFromSnippet(slice);
    // STRICT: Only return if email truly matches the professor's name!
    const nameMatch = sliceEmails.find(em => emailMatchesName(em, professorName));
    if (nameMatch) return nameMatch;
    searchPos = idx + fullName.length;
  }

  // 3. Page-level matching ONLY if email strictly matches professor's name
  const allPageEmails = getEmailsFromSnippet(html);
  if (allPageEmails.length === 0) return null;

  const directMatch = allPageEmails.find(em => emailMatchesName(em, professorName));
  if (directMatch) return directMatch;

  return null;
}

/**
 * Backward compatibility wrapper.
 */
function extractEmailFromHtml(html, professorName = '') {
  if (professorName) {
    return extractTargetProfessorEmail(html, professorName);
  }
  return null;
}

/**
 * Fetch a webpage and extract email directly from its HTML.
 */
async function extractEmailFromUrl(url, professorName = '') {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
  const html = await fetchPage(url);
  return extractTargetProfessorEmail(html, professorName);
}

function extractJson(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (match) {
    try { return JSON.parse(match[1]); } catch { }
  }
  try { return JSON.parse(text); } catch { }
  return null;
}

/**
 * Hybrid search: tries native search tool if permitted, else uses live web results.
 */
async function geminiSearch(prompt, systemInstruction = '', liveSearchQuery = '') {
  // If a live search query was provided or native tool has quota limits, fetch live web grounding
  let liveWebResults = [];
  if (liveSearchQuery) {
    liveWebResults = await searchWeb(liveSearchQuery);
  }

  // Attempt with native Google Search tool if available
  try {
    const config = {
      tools: [{ googleSearch: {} }],
      temperature: 0.1,
    };
    if (systemInstruction) config.systemInstruction = systemInstruction;

    const response = await genai.models.generateContent({
      model: MODELS[0],
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config,
    });

    const candidate = response.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text).join('') || '';
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
    const searchQueries = candidate?.groundingMetadata?.webSearchQueries || [];

    if (text) {
      return { text, groundingChunks, searchQueries };
    }
  } catch (err) {
    // Quota exhausted (429) or tool not permitted -> fall back to live web grounding
    console.info(`Native search tool unavailable (${err.message?.slice(0, 60)}), using live web grounding.`);
  }

  // Augment prompt with verified live web results
  let augmentedPrompt = prompt;
  if (liveWebResults.length > 0) {
    const webContext = liveWebResults.map((r, i) =>
      `[Source ${i + 1}] Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`
    ).join('\n\n');

    augmentedPrompt = `CRITICAL: Base your answer strictly on the real verified web search results provided below. Do not guess, fabricate, or hallucinate any facts, links, titles, or email addresses.\n\nVERIFIED WEB SEARCH RESULTS:\n${webContext}\n\n${prompt}`;
  }

  const text = await geminiGenerate(augmentedPrompt, systemInstruction);
  const groundingChunks = liveWebResults.map(r => ({
    web: { uri: r.url, title: r.title }
  }));

  return { text, groundingChunks, searchQueries: [liveSearchQuery].filter(Boolean) };
}

/**
 * STEP 1: Identify professor and find their official profile.
 */
export async function identifyProfessor(professorName, university) {
  const cleanName = cleanAuthorName(professorName);

  // 1. Pre-query OpenAlex for verified author identity and institution
  let openAlexAuthor = null;
  try {
    const authorRes = await fetch(`https://api.openalex.org/authors?search=${encodeURIComponent(cleanName)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (authorRes.ok) {
      const authorData = await authorRes.json();
      openAlexAuthor = authorData.results?.find(a =>
        a.last_known_institutions?.some(inst => {
          const instName = (inst.display_name || '').toLowerCase();
          const u = university.toLowerCase();
          return instName.includes(u) || u.includes(instName) ||
            (u.includes('nit') && instName.includes('national institute of technology')) ||
            (u.includes('iit') && instName.includes('indian institute of technology')) ||
            (u.includes('trichy') && instName.includes('tiruchirappalli'));
        })
      ) || authorData.results?.[0];
    }
  } catch (e) {
    console.warn('OpenAlex author lookup:', e.message);
  }

  const searchQuery = `${cleanName} ${university} faculty profile department email lab`;
  const prompt = `Search for the official university faculty profile of professor "${professorName}" at "${university}".
${openAlexAuthor ? `VERIFIED ACADEMIC PROFILE GROUND TRUTH:
- Full Author Name: ${openAlexAuthor.display_name}
- Verified Institution: ${openAlexAuthor.last_known_institutions?.map(i => i.display_name).join(', ') || university}
- Research Concepts: ${openAlexAuthor.x_concepts?.slice(0, 5).map(c => c.display_name).join(', ') || 'N/A'}` : ''}

Find:
1. Their official faculty/department page URL
2. Their full name and title
3. Their department
4. Their research areas/interests
5. Their official email address if listed on the page or contact directory
6. Any lab or research group they lead

Be very specific. Only report information that is clearly from the official university website or verified academic sources.

Respond in this exact JSON format:
{
  "identified": true,
  "confidence": "high",
  "ambiguity_issue": null,
  "professor": {
    "full_name": "${openAlexAuthor?.display_name || professorName}",
    "title": "...",
    "department": "...",
    "university": "${university}",
    "profile_url": "...",
    "email": null or "...",
    "email_source": null or "url where email was found",
    "lab_name": null or "...",
    "lab_url": null or "...",
    "research_areas": ["...", "..."]
  }
}`;

  const { text, groundingChunks } = await geminiSearch(
    prompt,
    'You are an academic research assistant. Only report verified facts from official university sources.',
    searchQuery
  );
  const data = extractJson(text);

  let sources = groundingChunks.map(c => ({ url: c.web?.uri, title: c.web?.title })).filter(c => c.url);
  if (!sources.length && data?.professor) {
    if (data.professor.profile_url) {
      sources.push({ url: data.professor.profile_url, title: `${data.professor.full_name || professorName} - Official Profile` });
    }
    if (data.professor.lab_url) {
      sources.push({ url: data.professor.lab_url, title: `${data.professor.lab_name || 'Lab'} Website` });
    }
  }

  // Actively discover email from the official faculty profile page or top candidate links
  if (data?.professor) {
    if (openAlexAuthor && !data.identified) {
      data.identified = true;
      data.confidence = 'high';
      data.ambiguity_issue = null;
    }

    // Multi-place email verification & source confirmation
    let verifiedEmail = null;
    let verifiedEmailSource = null;

    const candidateUrlsToCheck = [
      data.professor.profile_url,
      data.professor.lab_url,
      ...sources.map(s => s.url)
    ].filter(Boolean);

    for (const url of candidateUrlsToCheck) {
      try {
        const html = await fetchPage(url);
        if (!html) continue;
        const pageEmail = extractTargetProfessorEmail(html, cleanName);
        if (pageEmail) {
          verifiedEmail = pageEmail;
          verifiedEmailSource = url;
          break;
        }

        // If directory or parent page, check sublinks matching professor name
        const nameTokens = cleanName.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
        const sublinks = [...html.matchAll(/href="([^"]+)"/gi)]
          .map(m => m[1])
          .filter(l => nameTokens.some(tok => l.toLowerCase().includes(tok)));

        for (const sub of sublinks.slice(0, 5)) {
          const resolved = sub.startsWith('http') ? sub : new URL(sub, url).href;
          const subHtml = await fetchPage(resolved);
          if (subHtml) {
            const subEmail = extractTargetProfessorEmail(subHtml, cleanName);
            if (subEmail) {
              verifiedEmail = subEmail;
              verifiedEmailSource = resolved;
              data.professor.profile_url = resolved;
              break;
            }
          }
        }
        if (verifiedEmail) break;
      } catch { }
    }

    if (verifiedEmail && verifiedEmailSource) {
      data.professor.email = verifiedEmail;
      data.professor.email_source = verifiedEmailSource;
    } else if (data.professor.email) {
      // Validate that AI predicted email strictly matches the target professor's name
      const isNameMatch = emailMatchesName(data.professor.email, cleanName);
      let htmlConfirmed = false;
      const urlToVerify = data.professor.email_source || data.professor.profile_url;
      if (isNameMatch && urlToVerify) {
        try {
          const profileHtml = await fetchPage(urlToVerify);
          const extracted = extractTargetProfessorEmail(profileHtml, cleanName);
          if (extracted && extracted.toLowerCase() === data.professor.email.toLowerCase()) {
            htmlConfirmed = true;
            data.professor.email = extracted;
            data.professor.email_source = urlToVerify;
          }
        } catch {}
      }
      if (!htmlConfirmed) {
        // Discard hallucinated or mismatched email
        data.professor.email = null;
        data.professor.email_source = null;
      }
    } else {
      data.professor.email = null;
      data.professor.email_source = null;
    }
  }

  return {
    raw: text,
    parsed: data,
    sources,
  };
}

/**
 * STEP 2: Find and verify publications.
 */
export async function findPublications(professorName, university, department, researchAreas) {
  // 1. Fetch authoritative papers from OpenAlex
  const openAlexData = await fetchOpenAlexPublications(professorName, university);
  let publications = openAlexData.publications || [];
  let scholarUrl = openAlexData.scholar_url;

  // 2. If OpenAlex returned fewer than 3, supplement with live search
  if (publications.length < 3) {
    const areasStr = researchAreas?.length ? researchAreas.join(', ') : 'their field';
    const searchQuery = `"${professorName}" "${university}" recent academic publications google scholar`;
    const prompt = `Search for recent academic publications by Professor "${professorName}" at "${university}"${department ? `, Department of ${department}` : ''}.

Focus on their work related to: ${areasStr}

Find their most recent and significant papers. For each publication:
- Verify the title exactly
- Confirm authorship (must include "${professorName}")
- Find the publication venue (journal/conference)
- Find the year
- Find a DOI or URL if available
- Get a brief description of what the research is about

Return JSON:
{
  "publications": [
    {
      "title": "exact title",
      "authors": ["...", "..."],
      "year": 2024,
      "venue": "...",
      "doi": null or "...",
      "url": null or "...",
      "abstract_snippet": "brief description of the research",
      "verified_author": true,
      "source_url": "where you found this"
    }
  ],
  "scholar_profile_url": null or "...",
  "total_found": 5
}`;

    const { text } = await geminiSearch(
      prompt,
      'You are an academic research assistant. Only include publications where authorship is confirmed. Never fabricate paper titles.',
      searchQuery
    );
    const parsedData = extractJson(text);
    if (parsedData?.publications?.length) {
      // Merge unique papers
      const existingTitles = new Set(publications.map(p => p.title.toLowerCase().trim()));
      for (const p of parsedData.publications) {
        if (p.title && !existingTitles.has(p.title.toLowerCase().trim())) {
          publications.push(p);
        }
      }
      if (!scholarUrl && parsedData.scholar_profile_url) {
        scholarUrl = parsedData.scholar_profile_url;
      }
    }
  }

  const sources = [];
  if (scholarUrl) {
    sources.push({ url: scholarUrl, title: 'Author Profile / ORCID' });
  }
  for (const p of publications) {
    const u = p.url || p.doi || p.source_url;
    if (u && !sources.some(s => s.url === u)) {
      sources.push({ url: u, title: p.title });
    }
  }

  return {
    raw: JSON.stringify(publications),
    parsed: {
      publications,
      scholar_profile_url: scholarUrl,
      total_found: publications.length,
    },
    sources,
  };
}

/**
 * STEP 3: Get current research projects / lab activity / open positions.
 */
export async function findCurrentResearch(professorName, university, labUrl, profileUrl) {
  const urlHints = [labUrl, profileUrl].filter(Boolean).join(' ');
  const searchQuery = `${professorName} ${university} lab current research projects open positions PhD hiring ${urlHints}`.trim();

  const prompt = `Look up the current research projects and open opportunities for Professor "${professorName}" at "${university}".

Find:
1. Active research projects or grants
2. Whether they are currently accepting PhD students or research assistants (only if explicitly stated)
3. Recent lab news or achievements
4. Specific research questions or topics they are currently investigating

IMPORTANT: Only report "accepting students" if there is explicit, current evidence (e.g., an open positions page, explicit quote on their website).

Return JSON:
{
  "current_projects": ["...", "..."],
  "accepting_students": null or true or false,
  "accepting_students_source": null or "url and evidence",
  "accepting_students_evidence": null or "exact quote or description",
  "open_positions": [],
  "recent_news": ["...", "..."],
  "lab_focus": "one paragraph description of current lab focus"
}`;

  const { text, groundingChunks } = await geminiSearch(
    prompt,
    'You are an academic research assistant. Do not assume the professor is accepting students unless there is explicit current evidence.',
    searchQuery
  );
  const data = extractJson(text);

  let sources = groundingChunks.map(c => ({ url: c.web?.uri, title: c.web?.title })).filter(c => c.url);
  if (!sources.length && data?.accepting_students_source) {
    sources.push({ url: data.accepting_students_source, title: 'Opportunities Source' });
  }
  if (!sources.length && labUrl) {
    sources.push({ url: labUrl, title: 'Lab Website' });
  }

  return {
    raw: text,
    parsed: data,
    sources,
  };
}

const EMAIL_STRATEGIST_SYSTEM_PROMPT = `You are an elite academic cold-email strategist who writes short, sharp, deeply specific cold emails from undergraduate and graduate students to research professors.

CRITICAL RULES FOR COLD EMAILS:
1. STRICT LENGTH (140 to 190 words maximum):
   - Busy professors read on their phones in 20–30 seconds. Emails over 200 words get ignored or skimmed.
   - Every single sentence must carry concrete technical weight. No filler, no throat-clearing.
2. TONE:
   - Mature, technically grounded, authentic student voice.
   - Absolutely NO sycophancy, flattery, or generic praise ("groundbreaking work", "world-renowned pioneer", "illustrious lab").
3. SELECTIVITY:
   - Select ONLY the 1 or 2 past projects or skills from the applicant's profile that directly overlap with this professor's domain. Discard all other skills.
4. SPECIFIC TECHNICAL BRIDGE (NO VAGUE/PHILOSOPHICAL PLATITUDES):
   - BANNED: Never write generic phrases like:
     * "have made me eager to explore how X is engineered at the silicon/system level"
     * "keen to learn how theoretical concepts are applied in practice"
     * "fascinated by the intersection of..."
     * "contribute my background to your ongoing research in [broad field]"
   - MANDATORY: Name the EXACT sub-task, architectural block, or engineering mechanism from the professor's lab thrusts or papers:
     * E.g. "RTL implementation of side-channel attack countermeasures or hardware accelerator pipelines for edge inference under your guidance."
     * E.g. "multiscale wave propagation modeling and finite-element analysis of smart composite structures."
     * E.g. "multi-agent negotiation protocols and distributed resource scheduling in edge-cloud environments."
   - Directly link the applicant's concrete tools (e.g. Verilog/Vivado, Zynq-7000 SoC, PXIe, ANSYS ACP, PyTorch) to that specific sub-task.
5. NO FORCED PAPER CITATIONS:
   - Do NOT quote full 20-word paper titles like a bibliography. Instead, reference the lab by name and the specific technical problems/blocks the lab is solving.

STUDY THESE TWO REAL GOLD-STANDARD EXAMPLES SENT BY STUDENTS:

--- GOLD-STANDARD EXAMPLE 1 (Targeted Research Internship) ---
Subject: Research Internship Inquiry: Analog/Mixed Signal & Hardware Security - Austadish Saikia

Respected Dr. Debayan Das Sir,

I hope this email finds you well.

My name is Austadish Saikia. I am a B.Tech student in Instrumentation and Control Engineering at NIT Trichy, 2026 graduate batch. I am keenly interested in electronics and circuit design, and especially analog/mixed signal circuit design. I am writing to you today to inquire if there may be a position available in your CSRL lab for a 1-year research internship under your guidance.

By taking this internship, I would like to reach the following objectives:
* Gaining a working knowledge of the full analog/mixed signal design flow (design-simulation-layout).
* Contributing to a research publication and preparing a good research profile before going abroad for higher studies.

I'm nearing the end of my six-month internship at Prodigy Technovations. Although I was offered a full-time position after the internship, due to an internal restructuring, I was transferred to the Technical-Marketing division. As my sole interest lies in engineering and research, I did not opt for that and would very much want to contribute to the lab by working on a good research problem.

I would be highly honored and pleased to contribute to the research work of your lab and learn from your expertise. My resume is attached here for your consideration.

Thanking you for your time and consideration. I eagerly look forward to your positive reply.

Sincerely,
Austadish Saikia, NIT Trichy

--- GOLD-STANDARD EXAMPLE 2 (Deep Technical Bridge) ---
Subject: Research Internship Inquiry: Multiphysics Modeling & Structural Dynamics - Vaibhav Kannan

Dear Prof. Mahapatra,

I am Vaibhav Kannan, a third-year Metallurgical and Materials Engineering student at NIT Trichy. I came across the work of the iMEMS Lab and was particularly interested in its focus on multiphysics behaviour, structural dynamics, and integrated material systems.

I have previously worked at DRDO (ADE), where I was involved in developing high-performance polymer matrix composites for UAV applications, focusing on advanced processing and material performance. I also completed a winter internship at IIT Madras, where I worked on fabrication and mechanical characterization of bamboo fibre-reinforced composites, along with ANSYS ACP-based analysis for UAV structures.

Through these experiences, I have developed a strong interest in linking material behaviour with structural performance, especially using modelling and simulation approaches.

I would like to explore an opportunity to work under your guidance and expand my understanding in areas like multiscale mechanics, wave propagation, and multiphysics modelling.

I have attached my resume for your consideration and would be glad to discuss further if there is a suitable opportunity.

Thank you for your time.

Warm regards,
Vaibhav Kannan
B.Tech, Metallurgical and Materials Engineering
NIT Trichy`;

/**
 * STEP 4: Generate personalized email from template.
 */
export async function personalizeEmail(params) {
  const {
    template,
    professorProfile,
    publications,
    currentResearch,
    userProfile,
    additionalInstructions,
  } = params;

  const pubList = publications?.slice(0, 3).map((p, i) =>
    `${i + 1}. "${p.title}" (${p.year}${p.venue ? `, ${p.venue}` : ''})`
  ).join('\n') || 'General lab publications.';

  const userName = userProfile?.name || '[Your Name]';
  const targetDegree = userProfile?.target_degree || 'Research Internship';
  const education = userProfile?.education || 'Undergraduate student';
  const researchInterests = userProfile?.research_interests || 'Engineering research';
  const skills = userProfile?.skills || '';
  const projects = userProfile?.projects || '';
  const background = userProfile?.background || '';
  const cvText = userProfile?.cv_text ? userProfile.cv_text.slice(0, 1000) : '';

  const researchAreas = professorProfile?.research_areas?.join(', ') || 'their research field';
  const labName = professorProfile?.lab_name || (professorProfile?.full_name ? `${professorProfile.full_name}'s Lab` : 'Research Lab');

  const prompt = `Write an authentic, personalized academic cold email for this applicant targeting this professor.
If a template is provided, use it as the structural foundation, replacing all placeholders with authentic, tailored content while maintaining the gold-standard style, tone, and 160-230 word count.

TEMPLATE TO ADAPT:
${template || '(Use the gold-standard Deep Technical Bridge structure)'}

APPLICANT PROFILE:
- Full Name: ${userName}
- Target Opportunity: ${targetDegree}
- Education: ${education}
- Core Research Interests: ${researchInterests}
- Technical Skills: ${skills}
- Notable Projects: ${projects}
- Background Summary: ${background}
${cvText ? `- Resume Excerpt: ${cvText}` : ''}

TARGET PROFESSOR & LAB:
- Professor: ${professorProfile?.full_name || 'Professor'}
- University: ${professorProfile?.university || 'University'}
- Department: ${professorProfile?.department || 'Department'}
- Lab / Research Group: ${labName}
- Core Research Thrusts: ${researchAreas}
- Lab Focus: ${currentResearch?.lab_focus || 'Ongoing research in ' + researchAreas}
- Recent Work / Publications:
${pubList}

ADDITIONAL USER INSTRUCTIONS:
${additionalInstructions || 'None'}

EXECUTION RULES:
1. SUBJECT LINE:
   - High-open-rate, professional, specific: "[Inquiry Type]: [2-3 Specific Technical Keywords] - ${userName}"
   - Example: "Research Internship Inquiry: FPGA & Hardware Design - ${userName}"
2. PARAGRAPH 1 (Identity & Lab Focus):
   - Direct self-introduction (name, degree, college, current standing).
   - Reference the specific lab name and 2-3 specific thrusts or core problems the lab works on.
3. PARAGRAPH 2 (Selected Experience & Concrete Tools):
   - Pick ONLY the 1 or 2 most relevant past experiences or projects from the applicant's profile that directly connect with this professor's domain.
   - Mention specific physical tools, frameworks, hardware, or methodologies (e.g. Vivado, Zynq-7000 SoC, PyTorch, DRDO testing, ANSYS, etc.).
4. PARAGRAPH 3 (The Synthesis / Bridge - MUST BE SHORT, CONCRETE & PRECISE):
   - Draw an explicit, technical connection between the applicant's prior tools and a SPECIFIC problem/sub-task in the professor's lab.
   - BANNED: Never write vague, philosophical filler like "made me eager to explore how circuits are engineered at the silicon level" or "keen to learn how theory is applied".
   - REQUIRED: Name 1–2 specific sub-tasks, architectural blocks, or mechanisms (e.g. "RTL implementation of side-channel attack countermeasures or hardware acceleration pipelines for edge inference").
5. PARAGRAPH 4 (Actionable Ask & Close):
   - Specific, respectful ask (e.g., research internship under their guidance, project attachment).
   - Mention attached resume/CV.
   - Professional student signature with name, degree, and institute.
6. STRICT LENGTH & CONSTRAINTS:
   - Word count MUST be between 140 and 190 words. Short and precise.
   - Absolutely NO generic praise, sycophancy, or robotic bibliographic citations.

Return JSON in this format:
{
  "subject": "...",
  "body": "...",
  "word_count": 190,
  "relevant_skills_selected": ["skill/project 1", "skill/project 2"],
  "connection_drawn": "one sentence explaining the bridge",
  "personalization_notes": ["what was personalized and why"],
  "claims_needing_verification": [
    { "claim": "...", "paper_title": "...", "needs_check": false }
  ]
}`;

  const text = await geminiGenerate(prompt, EMAIL_STRATEGIST_SYSTEM_PROMPT);
  const data = extractJson(text);
  return { raw: text, parsed: data };
}

/**
 * STEP 5: Verify every factual claim in the email.
 */
export async function verifyEmailClaims(emailBody, publications, professorProfile) {
  const pubTitles = publications?.map(p => `"${p.title}" (${p.year})`).join(', ') || 'none';
  const researchAreas = professorProfile?.research_areas?.join(', ') || 'N/A';
  const labName = professorProfile?.lab_name || 'N/A';

  const prompt = `Analyze this email and verify every factual claim about the professor's lab, research areas, and publications.

EMAIL:
${emailBody}

VERIFIED PROFESSOR RESEARCH PROFILE:
- Professor: ${professorProfile?.full_name} at ${professorProfile?.university}
- Lab: ${labName}
- Research Thrusts: ${researchAreas}
- Publications: ${pubTitles}

For each factual claim about research, lab focus, or publications:
1. Identify the claim
2. Check if it accurately matches the verified lab focus, research areas, or publication topics
3. Assign status: "verified" | "unverified" | "incorrect" | "reasonable_inference"
4. Explain the verdict

Return JSON:
{
  "claims": [
    {
      "claim": "exact text from email making a factual assertion",
      "status": "verified" | "unverified" | "incorrect" | "reasonable_inference",
      "supporting_publication": null or "topic/paper this refers to",
      "explanation": "why this is verified or not",
      "action_needed": null or "what to fix"
    }
  ],
  "overall_status": "pass" | "needs_revision",
  "issues_to_fix": ["list of required changes"]
}`;

  const text = await geminiGenerate(prompt);
  const data = extractJson(text);
  return { raw: text, parsed: data };
}

/**
 * Find professor email address from official sources.
 */
export async function findProfessorEmail(professorName, university, profileUrl) {
  const cleanName = cleanAuthorName(professorName);
  const nameTokens = cleanName.toLowerCase().split(/\s+/).filter(t => t.length >= 3);

  // 1. Direct inspection of profileUrl
  if (profileUrl) {
    try {
      const html = await fetchPage(profileUrl);
      if (html) {
        const directEmail = extractTargetProfessorEmail(html, cleanName);
        if (directEmail) {
          return {
            raw: directEmail,
            parsed: {
              email: directEmail,
              confidence: 'verified',
              source_url: profileUrl,
              source_description: 'Directly verified from official faculty profile page'
            },
            sources: [{ url: profileUrl, title: 'Official Faculty Profile' }]
          };
        }

        // If directory or faculty listing page, search sublinks matching name
        const sublinks = [...html.matchAll(/href="([^"]+)"/gi)]
          .map(m => m[1])
          .filter(l => nameTokens.some(tok => l.toLowerCase().includes(tok)));

        for (const sub of sublinks.slice(0, 5)) {
          const resolved = sub.startsWith('http') ? sub : new URL(sub, profileUrl).href;
          const subHtml = await fetchPage(resolved);
          if (subHtml) {
            const subEmail = extractTargetProfessorEmail(subHtml, cleanName);
            if (subEmail) {
              return {
                raw: subEmail,
                parsed: {
                  email: subEmail,
                  confidence: 'verified',
                  source_url: resolved,
                  source_description: `Verified from faculty directory profile (${resolved})`
                },
                sources: [{ url: resolved, title: 'Faculty Profile' }]
              };
            }
          }
        }

        // Also check parent directory if profileUrl was a specific path
        try {
          const parsedUrl = new URL(profileUrl);
          const parentDir = parsedUrl.pathname.replace(/[^/]+\/?$/, '');
          const dirUrl = `${parsedUrl.origin}${parentDir}`;
          if (dirUrl !== profileUrl) {
            const dirHtml = await fetchPage(dirUrl);
            if (dirHtml) {
              const dirSublinks = [...dirHtml.matchAll(/href="([^"]+)"/gi)]
                .map(m => m[1])
                .filter(l => nameTokens.some(tok => l.toLowerCase().includes(tok)));

              for (const sub of dirSublinks.slice(0, 5)) {
                const resolved = sub.startsWith('http') ? sub : new URL(sub, dirUrl).href;
                const subHtml = await fetchPage(resolved);
                if (subHtml) {
                  const subEmail = extractTargetProfessorEmail(subHtml, cleanName);
                  if (subEmail) {
                    return {
                      raw: subEmail,
                      parsed: {
                        email: subEmail,
                        confidence: 'verified',
                        source_url: resolved,
                        source_description: `Verified from department directory (${resolved})`
                      },
                      sources: [{ url: resolved, title: 'Official Department Profile' }]
                    };
                  }
                }
              }
            }
          }
        } catch { }
      }
    } catch { }
  }

  // 2. Peer department check if profileUrl contains department patterns
  if (profileUrl && profileUrl.includes('/departments/')) {
    const peerDepts = ['cse', 'cs', 'ca', 'it', 'ece', 'ai', 'cds', 'ee', 'eecs'];
    for (const d of peerDepts) {
      const peerUrl = profileUrl.replace(/\/departments\/[^/]+\//, `/departments/${d}/`);
      if (peerUrl !== profileUrl) {
        try {
          const peerHtml = await fetchPage(peerUrl);
          if (peerHtml) {
            const peerEmail = extractTargetProfessorEmail(peerHtml, cleanName);
            if (peerEmail) {
              return {
                raw: peerEmail,
                parsed: {
                  email: peerEmail,
                  confidence: 'verified',
                  source_url: peerUrl,
                  source_description: `Verified on department profile page (${peerUrl})`
                },
                sources: [{ url: peerUrl, title: 'Official Department Profile' }]
              };
            }
          }
        } catch { }
      }
    }
  }

  // 3. Perform targeted live search for contact/directory page and scan candidate pages
  const searchQuery = `${cleanName} ${university} faculty email contact directory official`;
  const webResults = await searchWeb(searchQuery);

  for (const res of webResults.slice(0, 6)) {
    try {
      const pageHtml = await fetchPage(res.url);
      if (!pageHtml) continue;
      const pageEmail = extractTargetProfessorEmail(pageHtml, cleanName);
      if (pageEmail) {
        return {
          raw: pageEmail,
          parsed: {
            email: pageEmail,
            confidence: 'verified',
            source_url: res.url,
            source_description: res.title || 'Official University Directory'
          },
          sources: [{ url: res.url, title: res.title }]
        };
      }

      // Check sublinks on search result page matching professor name
      const sublinks = [...pageHtml.matchAll(/href="([^"]+)"/gi)]
        .map(m => m[1])
        .filter(l => nameTokens.some(tok => l.toLowerCase().includes(tok)));

      for (const sub of sublinks.slice(0, 3)) {
        const resolved = sub.startsWith('http') ? sub : new URL(sub, res.url).href;
        const subHtml = await fetchPage(resolved);
        if (subHtml) {
          const subEmail = extractTargetProfessorEmail(subHtml, cleanName);
          if (subEmail) {
            return {
              raw: subEmail,
              parsed: {
                email: subEmail,
                confidence: 'verified',
                source_url: resolved,
                source_description: `Verified on directory link (${resolved})`
              },
              sources: [{ url: resolved, title: res.title || 'Official Directory' }]
            };
          }
        }
      }
    } catch { }
  }

  // 4. Fallback to Gemini search prompt with web snippets
  const prompt = `Search for the official email address of Professor "${cleanName}" at "${university}".

Only accept email addresses found on:
- The professor's official university faculty page${profileUrl ? ` (${profileUrl})` : ''}
- The professor's lab website
- Official university directory

Do NOT guess emails based on naming conventions. Do NOT infer emails.

Return JSON:
{
  "email": null or "found@email.com",
  "confidence": "verified" | "unverified" | "not_found",
  "source_url": null or "url where email was found",
  "source_description": "description of how the email was found"
}`;

  const { text, groundingChunks } = await geminiSearch(
    prompt,
    'Only report email addresses explicitly listed on official sources. Never guess or infer email addresses.',
    searchQuery
  );
  const data = extractJson(text);

  let verifiedSourceUrl = null;
  let verifiedEmail = null;

  if (data?.email && data?.source_url) {
    try {
      const checkHtml = await fetchPage(data.source_url);
      if (checkHtml) {
        const confirmedEmail = extractTargetProfessorEmail(checkHtml, cleanName);
        if (confirmedEmail && confirmedEmail.toLowerCase() === data.email.toLowerCase()) {
          verifiedSourceUrl = data.source_url;
          verifiedEmail = confirmedEmail;
        }
      }
    } catch { }
  }

  let sources = groundingChunks.map(c => ({ url: c.web?.uri, title: c.web?.title })).filter(c => c.url);
  if (verifiedSourceUrl) {
    sources.push({ url: verifiedSourceUrl, title: data?.source_description || 'Faculty Directory' });
  }

  return {
    raw: text,
    parsed: {
      email: verifiedEmail || null,
      confidence: verifiedEmail ? 'verified' : 'not_found',
      source_url: verifiedSourceUrl || null,
      source_description: verifiedEmail ? (data?.source_description || 'Faculty Directory') : 'Email not auto-discovered'
    },
    sources,
  };
}

export { geminiGenerate, geminiSearch, searchWeb, fetchOpenAlexPublications, extractEmailFromUrl, extractTargetProfessorEmail, cleanAuthorName };
