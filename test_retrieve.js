const fs = require('fs');

const SYNONYM_MAP = {
  "ચૂંટણી": ["voter", "epic", "મતદાર", "form 6", "election", "ચૂંટણી કાર્ડ", "ચુંટણી", "ચુંટણી કાર્ડ"],
  "ડોક્યુમેન્ટ": ["દસ્તાવેજ", "documents", "document"],
  "આધાર": ["aadhaar", "uidai", "aadhar", "આધાર કાર્ડ"],
  "pan": ["pan card", "પેન", "income tax", "itr"],
  "પાસપોર્ટ": ["passport", "psk"],
  "રેશન": ["ration", "ration card", "રાશન કાર્ડ"],
  "આવક": ["income", "આવકનો દાખલો", "income certificate"],
  "જાતિ": ["caste", "જાતિનો દાખલો", "caste certificate"],
  "જમીન": ["land", "જમીન મહેસૂલ", "anyror", "e-dhara"],
  "prime": ["prime membership", "પ્રાઇમ", "મેમ્બરશિપ"],
  "ડ્રાઇવિંગ": ["driving", "licence", "license", "dl", "sarathi"],
  "જન્મ": ["birth", "death", "મરણ", "birth certificate", "death certificate"],
  "સોગંદ": ["affidavit", "સોગંદનામું", "સોગન્દનામું"],
  "અરજી": ["application", "અરજી પત્ર"],
  "msme": ["gumasta", "ગુમાસ્તા", "business"],
  "કૃષિ": ["agriculture", "ખેતી", "ખેડૂત", "farmer"],
};

function retrieveContext(query, kbText, maxChars = 3000) {
  const qNorm = query.normalize('NFC').toLowerCase();
  const qWords = (qNorm.match(/[\p{L}\p{M}\p{N}]+/gu) || []).filter(w => w.length > 1);

  const expandedTerms = new Set(qWords);
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    const allTerms = [key, ...synonyms].map(t => t.normalize('NFC').toLowerCase());
    if (allTerms.some(t => qNorm.includes(t))) {
      allTerms.forEach(t => expandedTerms.add(t));
    }
  }

  // Split on ## and ###
  let rawSections = kbText.normalize('NFC').split(/\n(?=#{2,3}\s)/).filter(s => s.trim().length > 20);

  // Chunk sections > 1500 chars
  const chunkedSections = [];
  for (const sec of rawSections) {
    if (sec.length <= 1500) {
      chunkedSections.push(sec);
    } else {
      let currentChunk = "";
      const lines = sec.split('\n');
      for (const line of lines) {
        if (currentChunk.length + line.length > 1500 && currentChunk.length > 0) {
          chunkedSections.push(currentChunk);
          currentChunk = line;
        } else {
          currentChunk += (currentChunk ? "\n" : "") + line;
        }
      }
      if (currentChunk) chunkedSections.push(currentChunk);
    }
  }

  function score(section) {
    const lines = section.split('\n');
    const heading = lines[0].toLowerCase();
    const body = lines.slice(1).join('\n').toLowerCase();
    
    let sc = 0;
    for (const term of expandedTerms) {
      if (heading.includes(term)) sc += (term.length > 3 ? 6 : 3); // Heading x3 weight
      if (body.includes(term)) sc += (term.length > 3 ? 2 : 1);
    }
    return sc;
  }

  const ranked = chunkedSections
    .map(s => ({ s, sc: score(s) }))
    .filter(x => x.sc > 0)
    .sort((a, b) => b.sc - a.sc);

  return ranked.slice(0, 3);
}

const kb = fs.readFileSync('artifacts/api-server/src/lib/sahayak-knowledge.ts', 'utf8');

const q1 = "ચૂંટણી કાર્ડ કેવી રીતે બનાવવું?";
const q2 = "ચૂંટણી કાર્ડ કાઢવા માટે કયા કયા ડોક્યુમેન્ટ જોઈએ?";
const q3 = "આવકનો દાખલો";
const q4 = "PAN કાર્ડ";

console.log("Q1:", q1);
console.log(retrieveContext(q1, kb).map(r => `Score: ${r.sc}, Heading: ${r.s.split('\n')[0]}`));

console.log("\nQ2:", q2);
console.log(retrieveContext(q2, kb).map(r => `Score: ${r.sc}, Heading: ${r.s.split('\n')[0]}`));

console.log("\nQ3:", q3);
console.log(retrieveContext(q3, kb).map(r => `Score: ${r.sc}, Heading: ${r.s.split('\n')[0]}`));

console.log("\nQ4:", q4);
console.log(retrieveContext(q4, kb).map(r => `Score: ${r.sc}, Heading: ${r.s.split('\n')[0]}`));
