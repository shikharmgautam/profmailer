/**
 * NIRF (National Institutional Ranking Framework) rankings dictionary
 * Covers top engineering, research, and technical institutions across India.
 */
const NIRF_MAPPING = [
  { match: /iit\s+madras|indian\s+institute\s+of\s+technology\s+madras/i, rank: 1, name: 'IIT Madras' },
  { match: /iisc|indian\s+institute\s+of\s+science/i, rank: 2, name: 'IISc Bangalore' },
  { match: /iit\s+delhi|indian\s+institute\s+of\s+technology\s+delhi/i, rank: 3, name: 'IIT Delhi' },
  { match: /iit\s+bombay|indian\s+institute\s+of\s+technology\s+bombay/i, rank: 4, name: 'IIT Bombay' },
  { match: /iit\s+kanpur|indian\s+institute\s+of\s+technology\s+kanpur/i, rank: 5, name: 'IIT Kanpur' },
  { match: /iit\s+kharagpur|indian\s+institute\s+of\s+technology\s+kharagpur/i, rank: 6, name: 'IIT Kharagpur' },
  { match: /iit\s+roorkee|indian\s+institute\s+of\s+technology\s+roorkee/i, rank: 7, name: 'IIT Roorkee' },
  { match: /iit\s+guwahati|indian\s+institute\s+of\s+technology\s+guwahati/i, rank: 8, name: 'IIT Guwahati' },
  { match: /iit\s+hyderabad|indian\s+institute\s+of\s+technology\s+hyderabad/i, rank: 9, name: 'IIT Hyderabad' },
  { match: /nit\s+trichy|nit\s+tiruchirappalli|national\s+institute\s+of\s+technology\s+tiruchirappalli/i, rank: 10, name: 'NIT Trichy' },
  { match: /iit\s+bhu|iit\s+\(bhu\)|banaras\s+hindu\s+university.*technology/i, rank: 11, name: 'IIT (BHU) Varanasi' },
  { match: /iit\s+indore|indian\s+institute\s+of\s+technology\s+indore/i, rank: 12, name: 'IIT Indore' },
  { match: /bits\s+pilani|birla\s+institute\s+of\s+technology\s+and\s+science/i, rank: 13, name: 'BITS Pilani' },
  { match: /iiit\s+hyderabad|international\s+institute\s+of\s+information\s+technology.*hyderabad/i, rank: 14, name: 'IIIT Hyderabad' },
  { match: /nit\s+rourkela|national\s+institute\s+of\s+technology\s+rourkela/i, rank: 15, name: 'NIT Rourkela' },
  { match: /nit\s+surathkal|nitk|national\s+institute\s+of\s+technology\s+karnataka/i, rank: 16, name: 'NIT Surathkal' },
  { match: /iit\s+gandhinagar|indian\s+institute\s+of\s+technology\s+gandhinagar/i, rank: 17, name: 'IIT Gandhinagar' },
  { match: /iit\s+ropar|indian\s+institute\s+of\s+technology\s+ropar/i, rank: 18, name: 'IIT Ropar' },
  { match: /iit\s+patna|indian\s+institute\s+of\s+technology\s+patna/i, rank: 19, name: 'IIT Patna' },
  { match: /nit\s+calicut|national\s+institute\s+of\s+technology\s+calicut/i, rank: 20, name: 'NIT Calicut' },
  { match: /iit\s+jodhpur|indian\s+institute\s+of\s+technology\s+jodhpur/i, rank: 21, name: 'IIT Jodhpur' },
  { match: /iiit\s+bangalore|international\s+institute\s+of\s+information\s+technology.*bangalore/i, rank: 22, name: 'IIIT Bangalore' },
  { match: /iit\s+mandi|indian\s+institute\s+of\s+technology\s+mandi/i, rank: 23, name: 'IIT Mandi' },
  { match: /nit\s+warangal|national\s+institute\s+of\s+technology\s+warangal/i, rank: 24, name: 'NIT Warangal' },
  { match: /delhi\s+technological\s+university|dtu/i, rank: 25, name: 'Delhi Technological University (DTU)' },
  { match: /iit\s+bhubaneswar|indian\s+institute\s+of\s+technology\s+bhubaneswar/i, rank: 26, name: 'IIT Bhubaneswar' },
  { match: /iit\s+tirupati|indian\s+institute\s+of\s+technology\s+tirupati/i, rank: 27, name: 'IIT Tirupati' },
  { match: /iit\s+palakkad|indian\s+institute\s+of\s+technology\s+palakkad/i, rank: 28, name: 'IIT Palakkad' },
  { match: /nit\s+silchar|national\s+institute\s+of\s+technology\s+silchar/i, rank: 29, name: 'NIT Silchar' },
  { match: /nit\s+durgapur|national\s+institute\s+of\s+technology\s+durgapur/i, rank: 30, name: 'NIT Durgapur' },
  { match: /jadavpur\s+university/i, rank: 31, name: 'Jadavpur University' },
  { match: /vnit\s+nagpur|visvesvaraya\s+national\s+institute\s+of\s+technology/i, rank: 32, name: 'VNIT Nagpur' },
  { match: /mnit\s+jaipur|malaviya\s+national\s+institute\s+of\s+technology/i, rank: 33, name: 'MNIT Jaipur' },
  { match: /iiest\s+shibpur|indian\s+institute\s+of\s+engineering\s+science\s+and\s+technology/i, rank: 34, name: 'IIEST Shibpur' },
  { match: /mnnit\s+allahabad|motilal\s+nehru\s+national\s+institute\s+of\s+technology/i, rank: 35, name: 'MNNIT Allahabad' },
  { match: /coep|college\s+of\s+engineering\s+pune/i, rank: 36, name: 'COEP Technological University' },
  { match: /thapar\s+institute/i, rank: 37, name: 'Thapar Institute of Engineering' },
  { match: /psg\s+college/i, rank: 38, name: 'PSG College of Technology' },
  { match: /amrita\s+vishwa\s+vidyapeetham/i, rank: 39, name: 'Amrita Vishwa Vidyapeetham' },
  { match: /manit\s+bhopal|maulana\s+azad\s+national\s+institute\s+of\s+technology/i, rank: 40, name: 'MANIT Bhopal' },
  { match: /nit\s+kurukshetra|national\s+institute\s+of\s+technology\s+kurukshetra/i, rank: 41, name: 'NIT Kurukshetra' },
  { match: /iiit\s+allahabad|indian\s+institute\s+of\s+information\s+technology.*allahabad/i, rank: 42, name: 'IIIT Allahabad' },
  { match: /srm\s+institute/i, rank: 43, name: 'SRM Institute of Science and Technology' },
  { match: /aligarh\s+muslim\s+university|amu/i, rank: 44, name: 'Aligarh Muslim University (AMU)' },
  { match: /manipal\s+institute|mahe/i, rank: 45, name: 'Manipal Institute of Technology' },
  { match: /jamia\s+millia\s+islamia/i, rank: 46, name: 'Jamia Millia Islamia' },
  { match: /jnu|jawaharlal\s+nehru\s+university/i, rank: 47, name: 'Jawaharlal Nehru University' },
  { match: /banaras\s+hindu\s+university|bhu/i, rank: 48, name: 'Banaras Hindu University' },
  { match: /anna\s+university/i, rank: 49, name: 'Anna University' },
  { match: /nit\s+jalandhar|dr\s+b\s+r\s+ambedkar\s+national\s+institute/i, rank: 50, name: 'NIT Jalandhar' },
  { match: /iiit\s+delhi|indraprastha\s+institute\s+of\s+information\s+technology/i, rank: 52, name: 'IIIT Delhi' },
  { match: /vit|vellore\s+institute\s+of\s+technology/i, rank: 55, name: 'Vellore Institute of Technology (VIT)' },
];

/**
 * Returns NIRF ranking info for an Indian institution name.
 * If not explicitly in the top 50, calculates an appropriate tier based on university classification.
 */
export function getNIRFInfo(institutionName) {
  if (!institutionName) {
    return { rank: 999, label: 'Unranked', isRanked: false };
  }

  for (const item of NIRF_MAPPING) {
    if (item.match.test(institutionName)) {
      return {
        rank: item.rank,
        label: `NIRF #${item.rank}`,
        standardName: item.name,
        isRanked: true,
      };
    }
  }

  // Heuristic for other national institutes
  if (/iit|indian\s+institute\s+of\s+technology/i.test(institutionName)) {
    return { rank: 35, label: 'NIRF Top 35 (IIT)', standardName: institutionName, isRanked: true };
  }
  if (/iiit|information\s+technology/i.test(institutionName)) {
    return { rank: 55, label: 'NIRF Top 60 (IIIT)', standardName: institutionName, isRanked: true };
  }
  if (/nit|national\s+institute\s+of\s+technology/i.test(institutionName)) {
    return { rank: 58, label: 'NIRF Top 60 (NIT)', standardName: institutionName, isRanked: true };
  }
  if (/bits|birla/i.test(institutionName)) {
    return { rank: 25, label: 'NIRF Top 25 (BITS)', standardName: institutionName, isRanked: true };
  }

  return { rank: 150, label: 'NIRF Tier 2/3', standardName: institutionName, isRanked: false };
}

