import { getUserProfile } from '@/lib/db';
import { getNIRFInfo } from '@/lib/nirf';
import { geminiGenerate } from '@/lib/research';

// OpenAlex polite pool email
const POLITE_EMAIL = 'team@profmailer.app';

// Simple in-memory cache (query key -> { timestamp, data })
const discoveryCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Target country configurations for global discovery
const GLOBAL_COUNTRIES = [
  { code: 'IN', name: 'India', limit: 40 },
  { code: 'US', name: 'United States', limit: 35 },
  { code: 'GB', name: 'United Kingdom', limit: 20 },
  { code: 'CA', name: 'Canada', limit: 20 },
  { code: 'DE', name: 'Germany', limit: 15 },
  { code: 'CH', name: 'Switzerland', limit: 10 },
  { code: 'SG', name: 'Singapore', limit: 15 },
  { code: 'AU', name: 'Australia', limit: 15 },
];

/**
 * Fallback generator for Indian professors using Gemini if OpenAlex times out.
 */
async function generateIndiaFallbackProfessors(field, targetDegree) {
  try {
    const prompt = `Identify 30 real, prominent university professors and research lab directors working actively in "${field}" across top NIRF-ranked Indian institutions (IIT Madras, IISc Bangalore, IIT Delhi, IIT Bombay, IIT Kanpur, IIT Kharagpur, IIT Roorkee, IIT Guwahati, IIT Hyderabad, NIT Trichy, IIIT Hyderabad, BITS Pilani).

Return an array in this EXACT JSON format:
[
  {
    "name": "Full Name with title",
    "university": "Official University / Institute Name",
    "department": "Department name",
    "research_focus": "Short summary of their exact research focus in ${field}",
    "publication_venue": "Top Conference / Journal",
    "match_reason": "Specific reason why this lab is a strong fit for a ${targetDegree} candidate"
  }
]
Only return valid JSON inside a \`\`\`json markdown block.`;

    const text = await geminiGenerate(prompt, 'You are an academic advisor. Only identify real professors at accredited universities.');
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\[[\s\S]*\])/);
    if (!match) return [];
    const list = JSON.parse(match[1]);
    return list.map((p, idx) => {
      const nirf = getNIRFInfo(p.university);
      return {
        id: `fb-in-${idx}`,
        name: p.name,
        university: p.university,
        country: 'India',
        country_code: 'IN',
        nirf_rank: nirf.rank,
        nirf_label: nirf.label,
        is_ranked: nirf.isRanked,
        department: p.department || 'Computer Science & Engineering',
        research_focus: p.research_focus,
        publication_year: 2025,
        publication_venue: p.publication_venue || 'Leading IEEE/ACM Conference',
        doi: null,
        profile_url: null,
        email: null,
        email_source: null,
        match_reason: p.match_reason || `Prominent researcher in ${field}.`
      };
    });
  } catch (e) {
    console.error('Fallback generation error:', e);
    return [];
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    let { field, region = 'India', targetDegree = 'PhD', applicantBackground = '' } = body;

    // Inferred from profile if not provided
    if (!field || !field.trim()) {
      const profile = await getUserProfile();
      field = profile?.research_interests || profile?.skills || 'Artificial Intelligence';
      if (!applicantBackground) {
        applicantBackground = [profile?.education, profile?.projects, profile?.background].filter(Boolean).join('. ');
      }
    }

    const cleanedField = field.replace(/[^\w\s-]/g, ' ').trim();
    const cacheKey = `${cleanedField.toLowerCase()}_${region.toLowerCase()}_${targetDegree.toLowerCase()}`;

    // Check memory cache
    const cached = discoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return Response.json(cached.data);
    }

    const profMap = new Map();

    if (region === 'India') {
      let professors = [];

      try {
        // Fast, single-indexed query with 18s safe timeout
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(cleanedField)}&filter=institutions.country_code:IN&sort=publication_year:desc&per_page=45&mailto=${POLITE_EMAIL}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'ProfMailer/1.0 (https://profmailer.app; mailto:team@profmailer.app)' },
          signal: AbortSignal.timeout(18000)
        });

        if (res.ok) {
          const data = await res.json();
          for (const work of data.results || []) {
            for (const auth of work.authorships || []) {
              const a = auth.author;
              const inst = auth.institutions?.[0];
              if (a?.display_name && inst?.display_name && inst.country_code === 'IN' && !profMap.has(a.id)) {
                const nirf = getNIRFInfo(inst.display_name);
                profMap.set(a.id, {
                  id: a.id,
                  name: a.display_name,
                  university: inst.display_name,
                  country: 'India',
                  country_code: 'IN',
                  nirf_rank: nirf.rank,
                  nirf_label: nirf.label,
                  is_ranked: nirf.isRanked,
                  department: 'Computer Science & Engineering',
                  research_focus: work.title,
                  publication_year: work.publication_year,
                  publication_venue: work.primary_location?.source?.display_name || 'Academic Journal / Conference',
                  doi: work.doi,
                  profile_url: null,
                  email: null,
                  email_source: null,
                  match_reason: `Active author on "${work.title}" (${work.publication_year}), closely matching your focus in ${field}.`
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('OpenAlex India query error, activating fallback generator:', err.message);
      }

      // If OpenAlex returned fewer than 30 or timed out, use fallback
      if (profMap.size < 20) {
        const fallbacks = await generateIndiaFallbackProfessors(cleanedField, targetDegree);
        for (const fb of fallbacks) {
          if (!profMap.has(fb.name)) profMap.set(fb.name, fb);
        }
      }

      professors = Array.from(profMap.values()).sort((a, b) => a.nirf_rank - b.nirf_rank);

      const responsePayload = {
        success: true,
        field,
        region: 'India',
        count: professors.length,
        professors,
        countsByCountry: { India: professors.length }
      };

      discoveryCache.set(cacheKey, { timestamp: Date.now(), data: responsePayload });
      return Response.json(responsePayload);

    } else {
      // 2. GLOBAL DISCOVERY: Query across top global regions (US, UK, CA, DE, CH, SG, AU, IN)
      const targetCountries = region && region !== 'Global'
        ? GLOBAL_COUNTRIES.filter(c => c.name.toLowerCase() === region.toLowerCase())
        : GLOBAL_COUNTRIES;

      const fetchPromises = targetCountries.map(async (c) => {
        try {
          // Optimized per-country search with 16s timeout
          const url = `https://api.openalex.org/works?search=${encodeURIComponent(cleanedField)}&filter=institutions.country_code:${c.code}&sort=publication_year:desc&per_page=20&mailto=${POLITE_EMAIL}`;
          const res = await fetch(url, {
            headers: { 'User-Agent': 'ProfMailer/1.0 (https://profmailer.app; mailto:team@profmailer.app)' },
            signal: AbortSignal.timeout(16000)
          });
          if (!res.ok) return [];
          const data = await res.json();
          const countryProfs = [];
          const seen = new Set();

          for (const work of data.results || []) {
            for (const auth of work.authorships || []) {
              const a = auth.author;
              const inst = auth.institutions?.[0];
              if (a?.display_name && inst?.display_name && !seen.has(a.id)) {
                seen.add(a.id);
                const nirf = c.code === 'IN' ? getNIRFInfo(inst.display_name) : null;
                countryProfs.push({
                  id: a.id,
                  name: a.display_name,
                  university: inst.display_name,
                  country: c.name,
                  country_code: c.code,
                  nirf_rank: nirf ? nirf.rank : 999,
                  nirf_label: nirf ? nirf.label : null,
                  department: 'Computer Science / Engineering',
                  research_focus: work.title,
                  publication_year: work.publication_year,
                  publication_venue: work.primary_location?.source?.display_name || 'Leading Venue',
                  doi: work.doi,
                  profile_url: null,
                  email: null,
                  email_source: null,
                  match_reason: `Published "${work.title}" (${work.publication_year}), aligning with ${field} research goals.`
                });
                if (countryProfs.length >= c.limit) break;
              }
            }
            if (countryProfs.length >= c.limit) break;
          }
          return countryProfs;
        } catch (e) {
          console.warn(`Discovery failed for ${c.name}:`, e.message);
          return [];
        }
      });

      const resultsByCountry = await Promise.all(fetchPromises);
      const allProfessors = resultsByCountry.flat();

      // Sort country-wise, and for India sort by NIRF
      const countryOrder = ['United States', 'United Kingdom', 'Canada', 'Germany', 'Switzerland', 'Singapore', 'Australia', 'India'];
      allProfessors.sort((a, b) => {
        const countryIdxA = countryOrder.indexOf(a.country);
        const countryIdxB = countryOrder.indexOf(b.country);
        if (countryIdxA !== countryIdxB) {
          return (countryIdxA === -1 ? 99 : countryIdxA) - (countryIdxB === -1 ? 99 : countryIdxB);
        }
        if (a.country === 'India' && b.country === 'India') {
          return a.nirf_rank - b.nirf_rank;
        }
        return (b.publication_year || 0) - (a.publication_year || 0);
      });

      const countsByCountry = {};
      for (const p of allProfessors) {
        countsByCountry[p.country] = (countsByCountry[p.country] || 0) + 1;
      }

      const responsePayload = {
        success: true,
        field,
        region,
        count: allProfessors.length,
        professors: allProfessors,
        countsByCountry
      };

      discoveryCache.set(cacheKey, { timestamp: Date.now(), data: responsePayload });
      return Response.json(responsePayload);
    }

  } catch (error) {
    console.error('Discover professors error:', error);
    return Response.json(
      { error: error.message || 'Failed to discover professors' },
      { status: 500 }
    );
  }
}
