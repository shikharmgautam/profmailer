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

  function emailMatchesName(email) {
    const local = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (nameTokens.length >= 2) {
      const lastName = nameTokens[nameTokens.length - 1];
      const firstName = nameTokens[0];
      const firstInitial = firstName[0];
      const lastInitial = lastName[0];
      if (local.includes(lastName)) return true;
      if (local.includes(firstName + lastInitial) || local.includes(lastInitial + firstName)) return true;
      if (local.includes(firstInitial + lastName) || local.includes(lastName + firstInitial)) return true;
      if (local.includes(firstName) && local.includes(lastName)) return true;
      if (local === firstName || local === lastName) return true;
      return false;
    } else {
      return local.includes(nameTokens[0]);
    }
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

  // 1. Structural Container Search:
  const containerRegexes = [
    /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi,
    /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
    /<article\b[^>]*>([\s\S]*?)<\/article>/gi,
    /<div\b[^>]*(?:class|id)="[^"]*(?:faculty|member|person|card|profile|row|col|team|item|user|staff|box|post|view-row)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  ];

  for (const regex of containerRegexes) {
    const matches = [...html.matchAll(regex)];
    for (const match of matches) {
      const containerContent = match[1];
      const containerLower = containerContent.toLowerCase();
      const allPresent = nameTokens.every(tok => containerLower.includes(tok));
      if (allPresent) {
        const containerEmails = getEmailsFromSnippet(containerContent);
        if (containerEmails.length === 1) {
          return containerEmails[0];
        } else if (containerEmails.length > 1) {
          const matched = containerEmails.find(emailMatchesName);
          if (matched) return matched;
          return containerEmails[0];
        }
      }
    }
  }

  // 2. Proximity search around full name
  const fullName = nameTokens.join(' ');
  let searchPos = 0;
  while (true) {
    const idx = htmlLower.indexOf(fullName, searchPos);
    if (idx === -1) break;
    const start = Math.max(0, idx - 400);
    const end = Math.min(html.length, idx + 400);
    const slice = html.slice(start, end);
    const sliceEmails = getEmailsFromSnippet(slice);
    if (sliceEmails.length > 0) {
      const nameMatch = sliceEmails.find(emailMatchesName);
      if (nameMatch) return nameMatch;
      if (sliceEmails.length === 1) return sliceEmails[0];
    }
    searchPos = idx + fullName.length;
  }

  // 3. Page-level matching if email local-part matches professor's name
  const allPageEmails = getEmailsFromSnippet(html);
  if (allPageEmails.length === 0) return null;

  const directMatch = allPageEmails.find(emailMatchesName);
  if (directMatch) return directMatch;

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const pageHeading = `${titleMatch?.[1] || ''} ${h1Match?.[1] || ''}`.toLowerCase();
  const headingMentionsProf = nameTokens.every(tok => pageHeading.includes(tok));

  if (headingMentionsProf && allPageEmails.length <= 3) {
    return allPageEmails[0];
  }

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
    } else if (data.professor.email && data.professor.profile_url) {
      // Validate that AI predicted email actually belongs to the target professor
      const profileHtml = await fetchPage(data.professor.profile_url);
      const extractedFromProfile = extractTargetProfessorEmail(profileHtml, cleanName);
      if (extractedFromProfile && extractedFromProfile.toLowerCase() === data.professor.email.toLowerCase()) {
        data.professor.email_source = data.professor.profile_url;
      } else {
        // Clear unverified or mismatching email to prevent emailing wrong professor
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
    `${i + 1}. "${p.title}" (${p.year}${p.venue ? `, ${p.venue}` : ''}) ${p.doi ? `[DOI: ${p.doi}]` : ''} - ${p.abstract_snippet}`
  ).join('\n') || 'No specific publications identified.';

  const userName = userProfile?.name || '[Your Name]';
  const userContextParts = [];
  if (userProfile?.name) userContextParts.push(`Applicant Name: ${userProfile.name}`);
  if (userProfile?.target_degree) userContextParts.push(`Target Degree / Role: ${userProfile.target_degree}`);
  if (userProfile?.education) userContextParts.push(`Education & Degrees: ${userProfile.education}`);
  if (userProfile?.research_interests) userContextParts.push(`Applicant Research Interests: ${userProfile.research_interests}`);
  if (userProfile?.skills) userContextParts.push(`Key Technical Skills: ${userProfile.skills}`);
  if (userProfile?.projects) userContextParts.push(`Notable Projects & Past Research: ${userProfile.projects}`);
  if (userProfile?.background) userContextParts.push(`Academic Background Summary:\n${userProfile.background}`);
  if (userProfile?.cv_text) userContextParts.push(`Full Resume / CV Text:\n${userProfile.cv_text}`);

  const userContext = userContextParts.length > 0
    ? userContextParts.join('\n\n')
    : 'No applicant background provided. Use neutral, professional standard wording.';

  const researchAreas = professorProfile?.research_areas?.join(', ') || 'their research';

  const prompt = `You are an expert at writing personalized academic cold emails. 

TEMPLATE TO PERSONALIZE:
${template}

PROFESSOR DETAILS:
- Name: ${professorProfile?.full_name || 'Professor'}
- University: ${professorProfile?.university}
- Department: ${professorProfile?.department || 'N/A'}
- Research areas: ${researchAreas}
- Lab: ${professorProfile?.lab_name || 'N/A'}

VERIFIED PUBLICATIONS (cite one or more of these EXACT papers, do NOT invent titles):
${pubList}

CURRENT RESEARCH ACTIVITY:
${currentResearch?.lab_focus || 'General research in ' + researchAreas}
Accepting students: ${currentResearch?.accepting_students === true ? 'YES (verified)' : currentResearch?.accepting_students === false ? 'NO' : 'Unknown - do NOT mention this'}

APPLICANT'S AUTHENTIC BACKGROUND & RESUME:
${userContext}

ADDITIONAL INSTRUCTIONS: ${additionalInstructions || 'None'}

CRITICAL RULES:
- Deeply weave in the applicant's real background, projects, technical skills, and research interests so the email feels uniquely tailored and compelling.
- Connect the applicant's specific projects or skills to the professor's verified publication or lab focus.
- Replace placeholders like {user_name}, {user_background}, {research_topic}, {research_personalization} with polished, natural paragraphs.
- Cite the EXACT verified paper title from above.
- Never invent qualifications, degrees, or experience not present in the applicant's background.
- Keep the email concise, genuine, specific, and professional.
- Generate a compelling, high-open-rate subject line.

Return JSON:
{
  "subject": "...",
  "body": "...",
  "personalization_notes": ["what was personalized and why"],
  "claims_needing_verification": [
    { "claim": "...", "paper_title": "...", "needs_check": true }
  ]
}`;

  const text = await geminiGenerate(prompt);
  const data = extractJson(text);
  return { raw: text, parsed: data };
}

/**
 * STEP 5: Verify every factual claim in the email.
 */
export async function verifyEmailClaims(emailBody, publications, professorProfile) {
  const pubTitles = publications?.map(p => `"${p.title}" (${p.year})`).join(', ') || 'none';

  const prompt = `Analyze this email and verify every factual claim about the professor's research.

EMAIL:
${emailBody}

VERIFIED PUBLICATIONS:
${pubTitles}

PROFESSOR: ${professorProfile?.full_name} at ${professorProfile?.university}

For each factual claim about research, publications, or the professor:
1. Identify the claim
2. Check if it matches the verified publication data
3. Assign status: "verified" | "unverified" | "incorrect" | "reasonable_inference"
4. Explain the verdict

Return JSON:
{
  "claims": [
    {
      "claim": "exact text from email making a factual assertion",
      "status": "verified" | "unverified" | "incorrect" | "reasonable_inference",
      "supporting_publication": null or "title of the paper this refers to",
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
