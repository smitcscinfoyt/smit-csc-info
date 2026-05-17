import type { Language } from "@/lib/i18n";

export type LegalSection = {
  title: string;
  body?: string;
  items?: string[];
  subsections?: Array<{ title: string; items: string[] }>;
  callout?: { tone: "info" | "warn" | "success"; title?: string; text: string };
};

export type LegalDoc = {
  title: string;
  effectiveDate: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
  contact: {
    title: string;
    businessLine: string;
    addressLabel: string;
    address: string;
    emailLabel: string;
    email: string;
    grievanceLine: string;
  };
  footer: string;
};

const BRAND = "Smit CSC Info";
const ADDRESS = "42, Smit CSC Info, Ram Mandir Area, Osa Ghed, Mangrol, Junagadh, Gujarat – 362220, India";
const EMAIL = "smitcscinfoyt@gmail.com";
const EFFECTIVE = "2026-05-06";

export const TERMS_DOCS: Record<Language, LegalDoc> = {
  en: {
    title: "Terms of Service",
    effectiveDate: `Effective Date: ${EFFECTIVE}`,
    lastUpdated: `Last Updated: ${EFFECTIVE}`,
    intro:
      `Welcome to ${BRAND} ("we", "us", "our"), operated by a Udyam-registered sole proprietorship and CSC operator based in Mangrol, Junagadh, Gujarat. By accessing https://smitcscinfo.com/ or any of our services — including the Recharge Portal, Money Transfer (DMT), Wallet, KYC, digital tools (PDF Editor, Background Remover, Prime Studio, ID Card Engine), Prime membership, operator membership and the YouTube channel "Smit CSC Info" — you agree to these Terms of Service. Please read them carefully.`,
    sections: [
      {
        title: "1. Acceptance and Eligibility",
        items: [
          "You must be at least 18 years old and competent to enter into a legally binding agreement under Indian law.",
          "You must be an Indian resident with a valid mobile number and a government-issued identity document.",
          "By creating an account, registering for any membership, or using any service, you accept these Terms together with our Privacy Policy.",
          "If you use the platform on behalf of a business or another person, you represent that you have authority to bind them.",
        ],
      },
      {
        title: "2. Account, Security and T-PIN",
        subsections: [
          {
            title: "2.1 Registration",
            items: [
              "You must provide accurate, current and complete information at sign-up and keep it updated.",
              "One person should hold one account. Duplicate accounts may be merged or suspended.",
              "Roles available: User, Manager, Admin. Operator membership tiers (Silver / Gold / Premium) and Prime membership are activated only after successful payment.",
            ],
          },
          {
            title: "2.2 Login Credentials",
            items: [
              "You are responsible for keeping your password confidential. Passwords are stored hashed (bcrypt) and never visible to us.",
              "Sessions use signed JWT tokens. Logging out invalidates the local session.",
              "Notify us immediately at " + EMAIL + " if you suspect unauthorised access.",
            ],
          },
          {
            title: "2.3 T-PIN (Transaction PIN)",
            items: [
              "A T-PIN is required for sensitive operations such as Money Transfer of ₹500 or above.",
              "Never share your T-PIN with any person, including anyone claiming to be from our team. We will never ask for it.",
              "Three or more incorrect T-PIN attempts may temporarily block transaction privileges.",
            ],
          },
        ],
      },
      {
        title: "3. Services Offered",
        body: "We provide the following categories of services. Each service is subject to its specific operational rules in addition to these Terms.",
        subsections: [
          {
            title: "3.1 Information & Content",
            items: [
              "Government-scheme guides, instructional PDFs, scheme news, and educational YouTube videos hosted on the channel \"Smit CSC Info\".",
              "Content is provided for general informational purposes only and is not a substitute for professional or legal advice.",
            ],
          },
          {
            title: "3.2 Recharge Portal",
            items: [
              "Mobile, DTH, Postpaid bill, Electricity, Gas Cylinder, LIC Premium, FASTag, Google Play gift cards, NSDL PAN and similar utility services.",
              "Operator and circle auto-detection is best-effort (prefix-based, not MNP-aware). You may manually override before submitting.",
              "All transactions are routed through our licensed provider partner (A1Topup) and are subject to that provider's success / failure status.",
            ],
          },
          {
            title: "3.3 Money Transfer (Domestic Money Transfer / DMT)",
            items: [
              "Transfers are processed via IMPS or NEFT through NPCI member banks listed in our Bank list.",
              "Per-transaction limit: ₹25,000. Service charge: 1% of amount with a minimum of ₹5 and a maximum of ₹25 per transaction.",
              "Sender registration is mandatory; beneficiary verification (OTP and / or penny-drop) is mandatory before first transfer.",
              "Transactions of ₹500 or above require a valid T-PIN.",
              "Funds delivery is governed by NPCI / RBI rules and partner-bank acceptance. We are not liable for delays or rejections by the beneficiary bank.",
            ],
          },
          {
            title: "3.4 Wallet",
            items: [
              "Wallet top-ups are processed by PhonePe Payment Gateway. Funds are credited only after the gateway confirms success.",
              "The wallet is a stored-value account used to fund recharges, money transfers and membership upgrades on our platform. It is not a bank account, does not earn interest, and is not transferable to a third-party wallet.",
              "All credits and debits are recorded in an immutable wallet ledger.",
            ],
          },
          {
            title: "3.5 KYC (Know Your Customer)",
            items: [
              "Digital KYC and Manual KYC options are available. KYC is mandatory before performing money transfer and certain high-value services, in line with RBI / NPCI requirements.",
              "You must submit valid, unexpired and self-owned identity documents. Submission of forged or third-party documents is a punishable offence and will result in immediate account termination and possible reporting to authorities.",
            ],
          },
          {
            title: "3.6 Digital Tools",
            items: [
              "Background Remover: free in-browser version (privacy-preserving) and Prime-only Full-HD version (Remove.bg API).",
              "PDF Editor v2: in-browser editing including text, image, signature, brush, smart-text edit and OCR via Gemini 2.5 Flash / Google Vision.",
              "Prime Studio: Canva-style designer for Prime members with templates, brand kits, project autosave and export to PNG / JPG / PDF.",
              "ID Card Printing Engine: 86×56 mm aspect-ratio crop and printing utility.",
              "You retain ownership of files you upload. We process them only to deliver the chosen tool function and do not use them to train any model.",
            ],
          },
          {
            title: "3.7 Membership Plans",
            items: [
              "Operator memberships: Silver (free), Gold (one-time ₹999) and Premium (one-time ₹1,999). Each tier unlocks a specific commission share on recharge and DMT services.",
              "Prime membership: monthly, quarterly and yearly subscriptions that unlock premium tools and a 90% commission share while active.",
              "All paid memberships are processed via PhonePe through the unified checkout at /checkout/:scope/:planId.",
            ],
          },
          {
            title: "3.8 Coupons and Discounts",
            items: [
              "Coupons may be percent-based or fixed-amount, with per-user limits, total max-uses and validity windows.",
              "A coupon applies only to the plans listed in its Applicable Plans field (\"*\" means all plans).",
              "Coupons cannot be combined unless explicitly stated. Misuse, fraudulent stacking or automated redemption may invalidate the coupon and the related transaction.",
            ],
          },
          {
            title: "3.9 Support",
            items: [
              "You may submit support inquiries via /my-queries. Replies are issued by our support team or admin / manager users.",
              "We aim to respond to inquiries within a reasonable time, but no specific service-level guarantee is given.",
            ],
          },
        ],
      },
      {
        title: "4. Pricing, Payments and Refunds",
        callout: {
          tone: "warn",
          title: "Refund Policy",
          text:
            "All wallet top-ups, recharges, money transfers, membership payments, Prime subscriptions and digital-tool credits are non-refundable once the underlying transaction has been initiated successfully, except where explicitly required by law or where the transaction has failed at the provider end.",
        },
        items: [
          "All prices are displayed in Indian Rupees (₹) and are inclusive of applicable platform charges. No GST is currently collected (no GSTIN).",
          "Payments are processed by PhonePe Payment Gateway. We do not store your card, UPI handle or net-banking credentials on our servers.",
          "If a recharge or money-transfer attempt fails at the provider end, the corresponding wallet amount is auto-refunded to your in-app wallet (not to the original payment method) within the timelines defined by the provider.",
          "Disputed transactions must be raised within 7 days of the transaction date by emailing " + EMAIL + " with the transaction ID.",
          "Operator membership upgrades (Gold / Premium) are one-time, non-refundable activations.",
          "Prime subscriptions auto-expire at the end of the paid term and are not pro-rated on cancellation.",
        ],
      },
      {
        title: "5. Wallet, KYC and T-PIN Rules",
        items: [
          "The wallet is for transactional use on our platform only. It cannot be encashed back to a bank account.",
          "We may place a temporary hold on the wallet for fraud-prevention, regulatory compliance or pending investigations.",
          "KYC documents are processed only for verification and stored securely; see our Privacy Policy for retention details.",
          "T-PIN is mandatory for high-value money-transfer operations and may be extended to other services from time to time.",
        ],
      },
      {
        title: "6. Acceptable Use and Prohibited Activities",
        body: "You agree NOT to:",
        items: [
          "Use the platform for any unlawful, fraudulent or money-laundering purpose.",
          "Provide forged identity documents, third-party bank account details without consent, or false beneficiary information.",
          "Attempt to bypass T-PIN, KYC, transaction limits, coupon limits or commission rules.",
          "Reverse-engineer, scrape, mass-download, or interfere with the platform, its APIs, or third-party providers (PhonePe, A1Topup, NPCI, etc.).",
          "Upload illegal, obscene, hateful, copyrighted or harmful content via the digital tools.",
          "Use the platform to send unsolicited messages, spam or to violate any third party's intellectual-property or privacy rights.",
        ],
      },
      {
        title: "7. Third-Party Services",
        body:
          "We integrate with regulated third-party providers in order to deliver our services. Each provider has its own terms and privacy policy and is independently responsible for the accuracy and availability of its system.",
        items: [
          "PhonePe Payment Gateway — for wallet top-ups, Prime subscriptions and operator-membership payments.",
          "A1Topup — recharge, bill payment, money transfer and KYC processing.",
          "NPCI / IMPS / NEFT member banks — money-transfer settlement.",
          "Remove.bg — Full-HD background removal for Prime users.",
          "Google Gemini 2.5 Flash and Google Vision — OCR for the PDF Editor smart-text feature.",
          "Pixabay, Unsplash, YouTube Data API — content / asset discovery.",
        ],
      },
      {
        title: "8. Intellectual Property",
        items: [
          "All branding, trade marks, logos, written content, screen designs, code and the YouTube channel \"Smit CSC Info\" are owned by us or our licensors.",
          "Designs, files and projects you create using Prime Studio or the PDF Editor remain your property.",
          "You grant us a non-exclusive, royalty-free licence to host, store and back-up such files solely to provide the service to you.",
          "Templates and stock assets supplied within the tools may be used as part of your final design but may not be redistributed as standalone assets.",
        ],
      },
      {
        title: "9. Disclaimers and Limitation of Liability",
        items: [
          "Services are provided on an \"as is\" and \"as available\" basis. We do not warrant uninterrupted or error-free operation.",
          "We are not liable for transaction delays, failures or rejections caused by banks, NPCI, PhonePe, A1Topup, telecom operators, biller systems or other third parties.",
          "To the maximum extent permitted by law, our total aggregate liability for any claim arising out of or in connection with the services is limited to the amount of platform fees you actually paid us in the 30 days preceding the event giving rise to the claim.",
          "We are not liable for any indirect, incidental, consequential, special or punitive damages.",
        ],
      },
      {
        title: "10. Suspension and Termination",
        items: [
          "We may suspend or terminate your account, withhold pending commission, or block specific services if you breach these Terms or applicable law.",
          "On termination, your wallet balance (after deducting any disputed or held amount) may be refunded to a verified bank account at our discretion, subject to KYC and regulatory clearance.",
          "You may close your account at any time by emailing " + EMAIL + ". Closure does not affect transactions that have already been initiated.",
        ],
      },
      {
        title: "11. Governing Law and Jurisdiction",
        items: [
          "These Terms are governed by the laws of India, including the Information Technology Act 2000, RBI guidelines, NPCI rules and the Consumer Protection Act 2019, as applicable.",
          "Subject to mandatory consumer-law rights, the courts at Junagadh, Gujarat shall have exclusive jurisdiction over any dispute arising out of or in connection with these Terms.",
        ],
      },
      {
        title: "12. Changes to These Terms",
        items: [
          "We may update these Terms from time to time. Updated Terms become effective when posted on this page.",
          "Material changes will be notified through the platform or by email where reasonably possible.",
          "Your continued use of the platform after the effective date of any update means that you accept the updated Terms.",
        ],
      },
    ],
    contact: {
      title: "13. Contact and Grievance Officer",
      businessLine: `Operator: ${BRAND} (Sole Proprietorship, Udyam-registered CSC Operator)`,
      addressLabel: "Address:",
      address: ADDRESS,
      emailLabel: "Email:",
      email: EMAIL,
      grievanceLine:
        "Grievance Officer: For any grievance, please write to the email above with the subject \"Grievance\". We will acknowledge within 48 hours and aim to resolve within 30 days as required under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021.",
    },
    footer: `© ${new Date().getFullYear()} ${BRAND}. All rights reserved.`,
  },

  gu: {
    title: "સેવા શરતો (Terms of Service)",
    effectiveDate: `અમલ તારીખ: ${EFFECTIVE}`,
    lastUpdated: `છેલ્લે અપડેટ: ${EFFECTIVE}`,
    intro:
      `${BRAND} માં આપનું સ્વાગત છે. અમે Mangrol, Junagadh, Gujarat સ્થિત Udyam-registered sole proprietorship અને CSC operator છીએ. https://smitcscinfo.com/ અથવા અમારી કોઈપણ સેવા — Recharge Portal, Money Transfer (DMT), Wallet, KYC, ડિજિટલ ટૂલ્સ (PDF Editor, Background Remover, Prime Studio, ID Card Engine), Prime મેમ્બરશિપ, ઓપરેટર મેમ્બરશિપ અને YouTube ચેનલ "Smit CSC Info" — નો ઉપયોગ કરીને તમે આ સેવા શરતો સાથે સંમત થાઓ છો. કૃપા કરી ધ્યાનથી વાંચો.`,
    sections: [
      {
        title: "૧. સ્વીકૃતિ અને પાત્રતા",
        items: [
          "તમારી ઉંમર ઓછામાં ઓછી 18 વર્ષ હોવી જોઈએ અને ભારતીય કાયદા હેઠળ કાનૂની કરાર કરવા સક્ષમ હોવા જોઈએ.",
          "તમે ભારતના રહેવાસી હોવા જોઈએ, માન્ય મોબાઇલ નંબર અને સરકારી ઓળખ-પત્ર ધરાવતા હોવા જોઈએ.",
          "એકાઉન્ટ બનાવીને, કોઈપણ મેમ્બરશિપ માટે રજિસ્ટર કરીને અથવા કોઈપણ સેવા વાપરીને તમે આ શરતો અને અમારી Privacy Policy સ્વીકારો છો.",
          "જો તમે કોઈ વ્યવસાય અથવા અન્ય વ્યક્તિ વતી પ્લેટફોર્મ વાપરો છો, તો તમે ખાતરી આપો છો કે તમને એમના વતી બંધાવાનો અધિકાર છે.",
        ],
      },
      {
        title: "૨. એકાઉન્ટ, સુરક્ષા અને T-PIN",
        subsections: [
          {
            title: "૨.૧ રજિસ્ટ્રેશન",
            items: [
              "સાઇન-અપ સમયે સચોટ, વર્તમાન અને સંપૂર્ણ માહિતી આપો અને નિયમિત અપડેટ રાખો.",
              "એક વ્યક્તિએ માત્ર એક જ એકાઉન્ટ રાખવું જોઈએ. Duplicate એકાઉન્ટ merge અથવા suspend થઈ શકે છે.",
              "ઉપલબ્ધ ભૂમિકાઓ: User, Manager, Admin. ઓપરેટર મેમ્બરશિપ ટિયર (Silver / Gold / Premium) અને Prime મેમ્બરશિપ સફળ payment પછી જ સક્રિય થાય છે.",
            ],
          },
          {
            title: "૨.૨ લોગિન અને પાસવર્ડ",
            items: [
              "પાસવર્ડ ગુપ્ત રાખવાની જવાબદારી તમારી છે. પાસવર્ડ bcrypt હેશ સ્વરૂપે સ્ટોર થાય છે, અમારે પણ દેખાતા નથી.",
              "Session માટે signed JWT token નો ઉપયોગ થાય છે. Logout થી local session રદ થાય છે.",
              "જો અનધિકૃત ઉપયોગની શંકા હોય તો તરત જ " + EMAIL + " પર જાણ કરો.",
            ],
          },
          {
            title: "૨.૩ T-PIN (Transaction PIN)",
            items: [
              "₹500 અથવા તેથી વધુ ની Money Transfer જેવી સંવેદનશીલ કાર્યવાહી માટે T-PIN ફરજિયાત છે.",
              "T-PIN કોઈને પણ ન આપો — અમારી ટીમ સહિત. અમે ક્યારેય T-PIN નહીં માગીએ.",
              "ત્રણ કે વધુ ખોટા T-PIN પ્રયાસોથી transaction નો અધિકાર અસ્થાયી રીતે block થઈ શકે છે.",
            ],
          },
        ],
      },
      {
        title: "૩. ઓફર કરાતી સેવાઓ",
        body: "નીચેની શ્રેણીની સેવાઓ આપીએ છીએ. દરેક સેવા આ શરતો ઉપરાંત તેના ચોક્કસ operational rules ને આધીન છે.",
        subsections: [
          {
            title: "૩.૧ માહિતી અને કન્ટેન્ટ",
            items: [
              "Government-scheme માર્ગદર્શિકા, instructional PDFs, scheme સમાચાર અને YouTube ચેનલ \"Smit CSC Info\" પરના શૈક્ષણિક વિડિયો.",
              "કન્ટેન્ટ માત્ર સામાન્ય માહિતી માટે છે અને professional અથવા legal advice નો વિકલ્પ નથી.",
            ],
          },
          {
            title: "૩.૨ Recharge Portal",
            items: [
              "Mobile, DTH, Postpaid, Electricity, Gas Cylinder, LIC Premium, FASTag, Google Play ગિફ્ટ કાર્ડ, NSDL PAN અને સમાન utility સેવાઓ.",
              "Operator અને circle auto-detection best-effort (prefix આધારિત, MNP-aware નથી) છે. Submit કરતા પહેલાં તમે manually બદલી શકો છો.",
              "બધા transactions લાઇસન્સ-ધારી provider partner (A1Topup) મારફતે જાય છે અને એ provider ની success/failure status ને આધીન છે.",
            ],
          },
          {
            title: "૩.૩ Money Transfer (DMT)",
            items: [
              "Transfers IMPS અથવા NEFT મારફતે NPCI member બેંકોમાં process થાય છે — સૂચિ Bank list માં છે.",
              "Per-transaction મર્યાદા: ₹25,000. Service charge: રકમના 1% (ઓછામાં ઓછા ₹5 અને વધુમાં વધુ ₹25 પ્રતિ transaction).",
              "Sender registration ફરજિયાત છે; પ્રથમ transfer પહેલાં beneficiary verification (OTP અને/અથવા penny-drop) ફરજિયાત છે.",
              "₹500 અથવા તેથી વધુ ની transactions માટે માન્ય T-PIN જરૂરી છે.",
              "Funds ની delivery NPCI/RBI નિયમો અને partner-bank ની સ્વીકૃતિને આધીન છે. Beneficiary bank દ્વારા થયેલા delays/rejections માટે અમે જવાબદાર નથી.",
            ],
          },
          {
            title: "૩.૪ Wallet",
            items: [
              "Wallet top-up PhonePe Payment Gateway મારફતે process થાય છે. Gateway success confirm કરે પછી જ ફંડ જમા થાય છે.",
              "Wallet એ stored-value account છે જે recharges, money transfers અને membership upgrades માટે વપરાય છે. તે bank account નથી, વ્યાજ નથી મળતું, અને third-party wallet માં transfer નથી થઈ શકતું.",
              "બધા credit-debit immutable wallet ledger માં નોંધાય છે.",
            ],
          },
          {
            title: "૩.૫ KYC",
            items: [
              "Digital KYC અને Manual KYC બંને ઉપલબ્ધ છે. Money transfer અને કેટલીક high-value સેવાઓ પહેલાં KYC ફરજિયાત છે (RBI/NPCI જરૂરિયાત).",
              "માન્ય, અમાન્ય ન થયેલા અને પોતાના ID દસ્તાવેજો જ રજૂ કરો. ખોટા અથવા third-party દસ્તાવેજ રજૂ કરવા punishable offence છે અને એકાઉન્ટ તુરંત બંધ થશે તથા authorities ને રિપોર્ટ થઈ શકે છે.",
            ],
          },
          {
            title: "૩.૬ ડિજિટલ ટૂલ્સ",
            items: [
              "Background Remover: free in-browser version (privacy-preserving) અને Prime-only Full-HD version (Remove.bg API).",
              "PDF Editor v2: text, image, signature, brush, smart-text edit અને Gemini 2.5 Flash / Google Vision આધારિત OCR સહિત browser-based editing.",
              "Prime Studio: Prime members માટે Canva-style designer — templates, brand kits, project autosave અને PNG/JPG/PDF export.",
              "ID Card Printing Engine: 86×56 mm aspect-ratio crop અને printing utility.",
              "તમે upload કરેલી files ની માલિકી તમારી જ રહે છે. અમે માત્ર પસંદ કરેલા tool-function માટે જ process કરીએ છીએ — model training માટે ક્યારેય ન વાપરીએ.",
            ],
          },
          {
            title: "૩.૭ મેમ્બરશિપ યોજનાઓ",
            items: [
              "Operator memberships: Silver (free), Gold (one-time ₹999) અને Premium (one-time ₹1,999). દરેક tier recharge અને DMT સેવાઓમાં ચોક્કસ commission share unlock કરે છે.",
              "Prime membership: monthly, quarterly અને yearly subscription — premium tools તથા સક્રિય સમય દરમિયાન 90% commission share unlock કરે છે.",
              "બધા paid memberships unified checkout (/checkout/:scope/:planId) મારફતે PhonePe પર process થાય છે.",
            ],
          },
          {
            title: "૩.૮ Coupons અને Discounts",
            items: [
              "Coupons percent-based અથવા fixed-amount હોઈ શકે, સાથે per-user limit, total max-uses અને validity window હોય છે.",
              "Coupon માત્ર તેના Applicable Plans field માં દર્શાવેલા plans પર જ લાગુ થાય છે (\"*\" એટલે બધા plans).",
              "બે coupon સાથે combine થઈ શકતા નથી (જ્યાં સુધી સ્પષ્ટ ન કહ્યું હોય). દુરુપયોગ, fraudulent stacking અથવા automated redemption coupon અને સંબંધિત transaction અમાન્ય કરી શકે છે.",
            ],
          },
          {
            title: "૩.૯ Support",
            items: [
              "/my-queries મારફતે support inquiry submit કરી શકાય છે. Reply support team અથવા admin/manager users દ્વારા આપવામાં આવે છે.",
              "વાજબી સમયમાં જવાબ આપવાનો પ્રયત્ન કરીએ છીએ — પણ કોઈ ચોક્કસ SLA આપતા નથી.",
            ],
          },
        ],
      },
      {
        title: "૪. કિંમત, payment અને refund",
        callout: {
          tone: "warn",
          title: "Refund Policy",
          text:
            "Wallet top-up, recharge, money transfer, membership payment, Prime subscription અને digital-tool credits એક વાર transaction સફળ રીતે initiate થયા પછી non-refundable છે — સિવાય કે કાયદાથી જરૂરી હોય અથવા provider-end પર transaction fail ગયું હોય.",
        },
        items: [
          "બધી કિંમતો ભારતીય રૂપિયા (₹) માં દર્શાવેલી છે અને લાગુ platform charges સહિત છે. હાલમાં GST collect નથી થતો (GSTIN નથી).",
          "Payments PhonePe Payment Gateway મારફતે process થાય છે. અમે તમારા card / UPI handle / net-banking credentials server પર સ્ટોર નથી કરતા.",
          "જો recharge / money-transfer attempt provider-end પર fail જાય, તો સંબંધિત રકમ in-app wallet માં auto-refund થાય છે (original payment method પર નહીં) — provider દ્વારા નક્કી કરેલા timeline મુજબ.",
          "Disputed transactions ની જાણ transaction date થી 7 દિવસમાં " + EMAIL + " પર transaction ID સાથે કરો.",
          "Operator membership upgrade (Gold / Premium) one-time અને non-refundable activations છે.",
          "Prime subscriptions paid term પૂરી થયે auto-expire થાય છે; cancellation પર pro-rated refund નથી.",
        ],
      },
      {
        title: "૫. Wallet, KYC અને T-PIN નિયમો",
        items: [
          "Wallet માત્ર અમારા platform પર transactional ઉપયોગ માટે છે. Bank account માં પાછું encash નથી થઈ શકતું.",
          "Fraud-prevention, regulatory compliance અથવા pending investigation માટે અમે wallet પર temporary hold મૂકી શકીએ છીએ.",
          "KYC દસ્તાવેજો માત્ર verification માટે process થાય છે અને સુરક્ષિત રીતે સંગ્રહિત રહે છે — retention વિગતો માટે Privacy Policy જુઓ.",
          "T-PIN high-value money-transfer માટે ફરજિયાત છે અને સમય-સમય પર અન્ય સેવાઓ સુધી લંબાવાય શકે છે.",
        ],
      },
      {
        title: "૬. સ્વીકાર્ય ઉપયોગ અને પ્રતિબંધિત પ્રવૃત્તિઓ",
        body: "તમે NICHENI પ્રવૃત્તિઓ NHIN કરવા સંમત થાઓ છો:",
        items: [
          "ગેરકાયદેસર, fraudulent અથવા money-laundering હેતુ માટે platform નો ઉપયોગ.",
          "ખોટા identity દસ્તાવેજ, સંમતિ વગર third-party bank account અથવા ખોટી beneficiary માહિતી રજૂ કરવી.",
          "T-PIN, KYC, transaction limit, coupon limit અથવા commission rules bypass કરવાનો પ્રયત્ન.",
          "Platform, તેના APIs અથવા third-party providers (PhonePe, A1Topup, NPCI વગેરે) સાથે reverse-engineer, scrape, mass-download અથવા interfere કરવું.",
          "ડિજિટલ ટૂલ્સ મારફતે ગેરકાયદેસર, અશ્લીલ, hateful, copyrighted અથવા harmful કન્ટેન્ટ upload કરવું.",
          "Spam મોકલવા અથવા third-party ની intellectual-property/privacy નો ભંગ કરવા platform નો ઉપયોગ.",
        ],
      },
      {
        title: "૭. Third-Party Services",
        body:
          "અમારી સેવાઓ આપવા માટે અમે regulated third-party providers સાથે integrate કરીએ છીએ. દરેક provider ની પોતાની terms અને privacy policy હોય છે અને તેમની system ની ચોકસાઈ/ઉપલબ્ધતા માટે તેઓ સ્વતંત્ર રીતે જવાબદાર છે.",
        items: [
          "PhonePe Payment Gateway — wallet top-up, Prime subscription અને operator-membership payment.",
          "A1Topup — recharge, bill payment, money transfer અને KYC processing.",
          "NPCI / IMPS / NEFT member બેંકો — money-transfer settlement.",
          "Remove.bg — Prime users માટે Full-HD background removal.",
          "Google Gemini 2.5 Flash અને Google Vision — PDF Editor smart-text માટે OCR.",
          "Pixabay, Unsplash, YouTube Data API — content / asset discovery.",
        ],
      },
      {
        title: "૮. Intellectual Property",
        items: [
          "બધી branding, trade marks, logos, written content, screen designs, code અને YouTube ચેનલ \"Smit CSC Info\" અમારી અથવા અમારા licensors ની માલિકીની છે.",
          "Prime Studio અથવા PDF Editor વાપરીને બનાવેલી designs/files/projects તમારી માલિકીની રહે છે.",
          "તે files ને host, store અને backup કરવા માટે તમે અમને non-exclusive, royalty-free licence આપો છો — માત્ર સેવા આપવા માટે.",
          "Tools માંની templates અને stock assets તમારી final design નો ભાગ બની શકે પણ standalone assets તરીકે redistribute ન થઈ શકે.",
        ],
      },
      {
        title: "૯. Disclaimer અને જવાબદારી મર્યાદા",
        items: [
          "સેવાઓ \"as is\" અને \"as available\" ધોરણે આપવામાં આવે છે. Uninterrupted અથવા error-free operation ની ગેરંટી નથી.",
          "બેંકો, NPCI, PhonePe, A1Topup, telecom operators, biller systems અથવા અન્ય third parties દ્વારા થયેલા transaction delays/failures/rejections માટે અમે જવાબદાર નથી.",
          "કાયદાથી પરવાનગીય મર્યાદા સુધી, સેવાઓ સંબંધે કોઈ પણ claim માટેની અમારી કુલ aggregate liability — claim ઉદભવ્યાના 30 દિવસ પહેલાંના સમયમાં તમે અમને ખરેખર ચૂકવેલા platform fees સુધી મર્યાદિત છે.",
          "Indirect, incidental, consequential, special અથવા punitive damages માટે અમે જવાબદાર નથી.",
        ],
      },
      {
        title: "૧૦. Suspension અને Termination",
        items: [
          "આ Terms અથવા લાગુ કાયદાનો ભંગ થાય તો અમે એકાઉન્ટ suspend/terminate, pending commission રોકી રાખવી અથવા ચોક્કસ સેવાઓ block કરી શકીએ છીએ.",
          "Termination પર wallet balance (disputed/held રકમ બાદ કરીને) verified bank account પર refund થઈ શકે — અમારી discretion પર, KYC અને regulatory clearance ને આધીન.",
          "તમે ગમે ત્યારે " + EMAIL + " પર email કરીને એકાઉન્ટ બંધ કરાવી શકો છો. પહેલેથી initiate થયેલા transactions પર તેનો અસર નથી.",
        ],
      },
      {
        title: "૧૧. Governing Law અને Jurisdiction",
        items: [
          "આ Terms ભારતના કાયદાઓ — Information Technology Act 2000, RBI guidelines, NPCI rules અને Consumer Protection Act 2019 — હેઠળ governed છે, જે લાગુ હોય તે મુજબ.",
          "Mandatory consumer-law rights ને આધીન રાખીને, આ Terms સંબંધી કોઈપણ વિવાદ માટે Junagadh, Gujarat ની courts ને exclusive jurisdiction રહેશે.",
        ],
      },
      {
        title: "૧૨. Terms માં ફેરફાર",
        items: [
          "આ Terms સમય-સમય પર update થઈ શકે છે. આ page પર post થયે updated Terms અમલમાં આવે છે.",
          "Material ફેરફારની જાણ platform મારફતે અથવા email દ્વારા (જ્યાં વાજબી હોય ત્યાં) આપવામાં આવશે.",
          "કોઈ પણ update ની effective date પછી તમારો સતત ઉપયોગ એટલે updated Terms ની સ્વીકૃતિ.",
        ],
      },
    ],
    contact: {
      title: "૧૩. સંપર્ક અને Grievance Officer",
      businessLine: `Operator: ${BRAND} (Sole Proprietorship, Udyam-registered CSC Operator)`,
      addressLabel: "સરનામું:",
      address: ADDRESS,
      emailLabel: "Email:",
      email: EMAIL,
      grievanceLine:
        "Grievance Officer: કોઈપણ ફરિયાદ માટે ઉપરના email પર \"Grievance\" subject સાથે લખો. અમે 48 કલાકમાં acknowledge કરીશું અને Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021 મુજબ 30 દિવસમાં નિરાકરણનો પ્રયત્ન કરીશું.",
    },
    footer: `© ${new Date().getFullYear()} ${BRAND}. All rights reserved.`,
  },

  hi: {
    title: "सेवा शर्तें (Terms of Service)",
    effectiveDate: `प्रभावी तिथि: ${EFFECTIVE}`,
    lastUpdated: `अंतिम अपडेट: ${EFFECTIVE}`,
    intro:
      `${BRAND} में आपका स्वागत है। हम Mangrol, Junagadh, Gujarat स्थित Udyam-registered sole proprietorship और CSC operator हैं। https://smitcscinfo.com/ या हमारी कोई भी सेवा — Recharge Portal, Money Transfer (DMT), Wallet, KYC, डिजिटल टूल्स (PDF Editor, Background Remover, Prime Studio, ID Card Engine), Prime membership, operator membership और YouTube चैनल "Smit CSC Info" — का उपयोग करके आप इन सेवा शर्तों से सहमत होते हैं। कृपया ध्यान से पढ़ें।`,
    sections: [
      {
        title: "1. स्वीकृति और पात्रता",
        items: [
          "आपकी आयु कम-से-कम 18 वर्ष होनी चाहिए और भारतीय कानून के तहत कानूनी अनुबंध करने में सक्षम होने चाहिए।",
          "आप भारतीय निवासी होने चाहिए, मान्य मोबाइल नंबर और सरकारी पहचान-पत्र के साथ।",
          "खाता बनाकर, किसी membership के लिए register करके या किसी सेवा का उपयोग करके आप इन Terms और हमारी Privacy Policy को स्वीकार करते हैं।",
          "अगर आप किसी व्यवसाय या अन्य व्यक्ति की ओर से platform का उपयोग करते हैं, तो आप पुष्टि करते हैं कि आपके पास उन्हें bind करने का अधिकार है।",
        ],
      },
      {
        title: "2. खाता, सुरक्षा और T-PIN",
        subsections: [
          {
            title: "2.1 Registration",
            items: [
              "Sign-up पर सटीक, वर्तमान और पूर्ण जानकारी दें और updated रखें।",
              "एक व्यक्ति का एक ही खाता होना चाहिए। Duplicate खाते merge या suspend किए जा सकते हैं।",
              "उपलब्ध roles: User, Manager, Admin। Operator membership tiers (Silver / Gold / Premium) और Prime membership सफल payment के बाद ही सक्रिय होती है।",
            ],
          },
          {
            title: "2.2 Login और Password",
            items: [
              "Password गुप्त रखना आपकी जिम्मेदारी है। Passwords bcrypt hash के रूप में store होते हैं — हमें भी दिखाई नहीं देते।",
              "Sessions signed JWT tokens का उपयोग करते हैं। Logout local session रद्द कर देता है।",
              "अनधिकृत उपयोग का संदेह हो तो तुरंत " + EMAIL + " पर सूचित करें।",
            ],
          },
          {
            title: "2.3 T-PIN (Transaction PIN)",
            items: [
              "₹500 या उससे ऊपर के Money Transfer जैसे संवेदनशील operations के लिए T-PIN अनिवार्य है।",
              "T-PIN किसी को भी न दें — हमारी टीम सहित। हम कभी T-PIN नहीं माँगेंगे।",
              "तीन या अधिक गलत T-PIN प्रयासों से transaction अधिकार अस्थायी रूप से block हो सकता है।",
            ],
          },
        ],
      },
      {
        title: "3. प्रदान की जाने वाली सेवाएँ",
        body: "हम निम्न श्रेणियों की सेवाएँ देते हैं। प्रत्येक सेवा इन Terms के अतिरिक्त अपने operational rules के अधीन है।",
        subsections: [
          {
            title: "3.1 जानकारी और कन्टेन्ट",
            items: [
              "Government-scheme guides, instructional PDFs, scheme news और YouTube चैनल \"Smit CSC Info\" पर शैक्षिक videos।",
              "कन्टेन्ट केवल सामान्य जानकारी हेतु है — यह professional या legal advice का विकल्प नहीं।",
            ],
          },
          {
            title: "3.2 Recharge Portal",
            items: [
              "Mobile, DTH, Postpaid, Electricity, Gas Cylinder, LIC Premium, FASTag, Google Play gift card, NSDL PAN आदि utility सेवाएँ।",
              "Operator और circle auto-detection best-effort (prefix-based, MNP-aware नहीं) है। Submit से पहले आप manually बदल सकते हैं।",
              "सभी transactions हमारे licensed provider partner (A1Topup) द्वारा process होते हैं और उसकी success/failure status के अधीन हैं।",
            ],
          },
          {
            title: "3.3 Money Transfer (DMT)",
            items: [
              "Transfers IMPS या NEFT द्वारा NPCI member banks में process होते हैं — सूची Bank list में है।",
              "Per-transaction limit: ₹25,000। Service charge: राशि का 1% (न्यूनतम ₹5, अधिकतम ₹25 प्रति transaction)।",
              "Sender registration अनिवार्य; पहले transfer से पहले beneficiary verification (OTP और/या penny-drop) अनिवार्य।",
              "₹500 या उससे ऊपर की transactions के लिए मान्य T-PIN आवश्यक।",
              "Funds delivery NPCI/RBI नियमों और partner-bank acceptance के अधीन है। Beneficiary bank द्वारा हुए delays/rejections के लिए हम जिम्मेदार नहीं।",
            ],
          },
          {
            title: "3.4 Wallet",
            items: [
              "Wallet top-up PhonePe Payment Gateway द्वारा process होते हैं। Gateway success confirm करने पर ही funds जमा होते हैं।",
              "Wallet stored-value account है — recharges, money transfers और membership upgrades के लिए। यह bank account नहीं, ब्याज नहीं देता, third-party wallet में transferable नहीं।",
              "सभी credits-debits immutable wallet ledger में दर्ज होते हैं।",
            ],
          },
          {
            title: "3.5 KYC",
            items: [
              "Digital KYC और Manual KYC दोनों उपलब्ध हैं। Money transfer और कुछ high-value सेवाओं से पहले KYC अनिवार्य है (RBI/NPCI requirements)।",
              "मान्य, अनएक्सपायर्ड और स्व-स्वामित्व वाले ID दस्तावेज़ ही जमा करें। फर्जी या third-party दस्तावेज़ punishable offence है — खाता तत्काल बंद होगा और authorities को रिपोर्ट किया जा सकता है।",
            ],
          },
          {
            title: "3.6 डिजिटल टूल्स",
            items: [
              "Background Remover: free in-browser version (privacy-preserving) और Prime-only Full-HD version (Remove.bg API)।",
              "PDF Editor v2: text, image, signature, brush, smart-text edit और Gemini 2.5 Flash / Google Vision आधारित OCR सहित in-browser editing।",
              "Prime Studio: Prime members के लिए Canva-style designer — templates, brand kits, project autosave और PNG/JPG/PDF export।",
              "ID Card Printing Engine: 86×56 mm aspect-ratio crop और printing utility।",
              "Upload की गई files का स्वामित्व आपका रहता है। हम केवल चुने गए tool-function के लिए process करते हैं — model training में कभी उपयोग नहीं।",
            ],
          },
          {
            title: "3.7 Membership Plans",
            items: [
              "Operator memberships: Silver (free), Gold (one-time ₹999) और Premium (one-time ₹1,999)। प्रत्येक tier recharge और DMT सेवाओं में specific commission share unlock करता है।",
              "Prime membership: monthly, quarterly और yearly subscriptions — premium tools और सक्रिय रहने तक 90% commission share देती है।",
              "सभी paid memberships unified checkout (/checkout/:scope/:planId) के माध्यम से PhonePe पर process होते हैं।",
            ],
          },
          {
            title: "3.8 Coupons और Discounts",
            items: [
              "Coupons percent-based या fixed-amount हो सकते हैं — per-user limit, total max-uses और validity window के साथ।",
              "Coupon केवल अपने Applicable Plans field में सूचीबद्ध plans पर लागू होता है (\"*\" का अर्थ सभी plans)।",
              "जब तक स्पष्ट न कहा हो, coupons combine नहीं किए जा सकते। दुरुपयोग, fraudulent stacking या automated redemption coupon और संबंधित transaction को अमान्य कर सकता है।",
            ],
          },
          {
            title: "3.9 Support",
            items: [
              "/my-queries के माध्यम से support inquiry दर्ज कर सकते हैं। Reply support team या admin/manager users देते हैं।",
              "उचित समय में जवाब का प्रयास करते हैं — कोई specific SLA नहीं देते।",
            ],
          },
        ],
      },
      {
        title: "4. मूल्य, payment और refund",
        callout: {
          tone: "warn",
          title: "Refund Policy",
          text:
            "Wallet top-up, recharge, money transfer, membership payment, Prime subscription और digital-tool credits एक बार transaction सफलतापूर्वक initiate होने के बाद non-refundable हैं — सिवाय इसके कि कानून द्वारा अनिवार्य हो या provider-end पर transaction fail हो गया हो।",
        },
        items: [
          "सभी कीमतें भारतीय रुपये (₹) में हैं और लागू platform charges सहित। वर्तमान में GST collect नहीं किया जाता (कोई GSTIN नहीं)।",
          "Payments PhonePe Payment Gateway से process होते हैं। हम आपके card / UPI handle / net-banking credentials server पर store नहीं करते।",
          "अगर recharge / money-transfer attempt provider-end पर fail हो जाए, तो संबंधित राशि in-app wallet में auto-refund होती है (original payment method पर नहीं) — provider द्वारा निर्धारित timelines में।",
          "Disputed transactions की सूचना transaction date से 7 दिनों के भीतर " + EMAIL + " पर transaction ID सहित दें।",
          "Operator membership upgrades (Gold / Premium) one-time और non-refundable activations हैं।",
          "Prime subscriptions paid term समाप्ति पर auto-expire होती हैं; cancellation पर pro-rated refund नहीं।",
        ],
      },
      {
        title: "5. Wallet, KYC और T-PIN नियम",
        items: [
          "Wallet केवल हमारे platform पर transactional उपयोग के लिए है। Bank account में encash नहीं हो सकता।",
          "Fraud-prevention, regulatory compliance या pending investigation के लिए हम wallet पर temporary hold लगा सकते हैं।",
          "KYC documents केवल verification के लिए process होते हैं और सुरक्षित रूप से stored रहते हैं — retention विवरण के लिए Privacy Policy देखें।",
          "T-PIN high-value money-transfer के लिए अनिवार्य है और समय-समय पर अन्य सेवाओं में extend हो सकता है।",
        ],
      },
      {
        title: "6. स्वीकार्य उपयोग और निषिद्ध गतिविधियाँ",
        body: "आप निम्न नहीं करने के लिए सहमत हैं:",
        items: [
          "Platform का उपयोग किसी भी अवैध, fraudulent या money-laundering उद्देश्य के लिए।",
          "फर्जी ID दस्तावेज़, बिना सहमति third-party bank account या गलत beneficiary जानकारी देना।",
          "T-PIN, KYC, transaction limit, coupon limit या commission rules को bypass करने का प्रयास।",
          "Platform, उसके APIs या third-party providers (PhonePe, A1Topup, NPCI आदि) के साथ reverse-engineer, scrape, mass-download या interfere करना।",
          "डिजिटल टूल्स के माध्यम से अवैध, अश्लील, hateful, copyrighted या harmful कन्टेन्ट upload करना।",
          "Spam भेजने या third party के intellectual-property/privacy अधिकारों का उल्लंघन करने के लिए platform का उपयोग।",
        ],
      },
      {
        title: "7. Third-Party Services",
        body:
          "अपनी सेवाएँ देने के लिए हम regulated third-party providers से integrate करते हैं। प्रत्येक provider की अपनी terms और privacy policy है और उनकी system की सटीकता/उपलब्धता के लिए वे स्वतंत्र रूप से जिम्मेदार हैं।",
        items: [
          "PhonePe Payment Gateway — wallet top-up, Prime subscription और operator-membership payment।",
          "A1Topup — recharge, bill payment, money transfer और KYC processing।",
          "NPCI / IMPS / NEFT member banks — money-transfer settlement।",
          "Remove.bg — Prime users के लिए Full-HD background removal।",
          "Google Gemini 2.5 Flash और Google Vision — PDF Editor smart-text के लिए OCR।",
          "Pixabay, Unsplash, YouTube Data API — content / asset discovery।",
        ],
      },
      {
        title: "8. Intellectual Property",
        items: [
          "सभी branding, trade marks, logos, written content, screen designs, code और YouTube चैनल \"Smit CSC Info\" हमारे या हमारे licensors के स्वामित्व में हैं।",
          "Prime Studio या PDF Editor से बनाई गई designs/files/projects आपकी संपत्ति रहती है।",
          "उन files को host, store और backup करने के लिए आप हमें non-exclusive, royalty-free licence देते हैं — केवल सेवा प्रदान करने हेतु।",
          "Tools के अंदर मिलने वाले templates और stock assets आपकी final design का हिस्सा बन सकते हैं — standalone assets के रूप में redistribute नहीं किए जा सकते।",
        ],
      },
      {
        title: "9. Disclaimers और Liability की सीमा",
        items: [
          "सेवाएँ \"as is\" और \"as available\" आधार पर दी जाती हैं। Uninterrupted या error-free operation की कोई गारंटी नहीं।",
          "Banks, NPCI, PhonePe, A1Topup, telecom operators, biller systems या अन्य third parties के कारण transaction delays/failures/rejections के लिए हम जिम्मेदार नहीं।",
          "कानून द्वारा अनुमत अधिकतम सीमा तक, सेवाओं से संबंधित किसी भी claim हेतु हमारी कुल aggregate liability — claim उत्पन्न होने से 30 दिन पहले की अवधि में आपके द्वारा हमें वास्तव में चुकाए गए platform fees तक सीमित है।",
          "Indirect, incidental, consequential, special या punitive damages के लिए हम जिम्मेदार नहीं।",
        ],
      },
      {
        title: "10. Suspension और Termination",
        items: [
          "इन Terms या लागू कानून के उल्लंघन पर हम खाता suspend/terminate, pending commission रोक सकते हैं या specific सेवाएँ block कर सकते हैं।",
          "Termination पर wallet balance (disputed/held राशि घटाकर) verified bank account पर refund हो सकता है — हमारी discretion पर, KYC और regulatory clearance के अधीन।",
          "आप कभी भी " + EMAIL + " पर email करके खाता बंद कर सकते हैं। पहले से initiate हो चुकी transactions प्रभावित नहीं होंगी।",
        ],
      },
      {
        title: "11. Governing Law और Jurisdiction",
        items: [
          "ये Terms भारत के कानूनों — Information Technology Act 2000, RBI guidelines, NPCI rules और Consumer Protection Act 2019 — के अधीन हैं, जैसा भी लागू हो।",
          "Mandatory consumer-law अधिकारों के अधीन, इन Terms से संबंधित किसी भी विवाद के लिए Junagadh, Gujarat की courts का exclusive jurisdiction होगा।",
        ],
      },
      {
        title: "12. Terms में परिवर्तन",
        items: [
          "ये Terms समय-समय पर update हो सकती हैं। इस page पर post होते ही updated Terms प्रभावी होंगी।",
          "Material परिवर्तनों की सूचना platform के माध्यम से या email द्वारा (जहाँ उचित हो) दी जाएगी।",
          "किसी भी update की effective date के बाद आपका निरंतर उपयोग = updated Terms की स्वीकृति।",
        ],
      },
    ],
    contact: {
      title: "13. संपर्क और Grievance Officer",
      businessLine: `Operator: ${BRAND} (Sole Proprietorship, Udyam-registered CSC Operator)`,
      addressLabel: "पता:",
      address: ADDRESS,
      emailLabel: "Email:",
      email: EMAIL,
      grievanceLine:
        "Grievance Officer: किसी भी शिकायत के लिए ऊपर दिए गए email पर \"Grievance\" subject के साथ लिखें। हम 48 घंटे के भीतर acknowledge करेंगे और Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021 के अनुसार 30 दिनों में समाधान का प्रयास करेंगे।",
    },
    footer: `© ${new Date().getFullYear()} ${BRAND}. All rights reserved.`,
  },
};

export const PRIVACY_DOCS: Record<Language, LegalDoc> = {
  en: {
    title: "Privacy Policy",
    effectiveDate: `Effective Date: ${EFFECTIVE}`,
    lastUpdated: `Last Updated: ${EFFECTIVE}`,
    intro:
      `${BRAND} respects your privacy. This Privacy Policy explains what personal data we collect, why we collect it, how we use and protect it, and your rights, when you use https://smitcscinfo.com/ or any of our services — Recharge Portal, Money Transfer, Wallet, KYC, digital tools, Prime membership, operator membership and the YouTube channel "Smit CSC Info".`,
    sections: [
      {
        title: "1. Information We Collect",
        body: "We collect only the minimum information required to deliver and secure our services.",
        subsections: [
          {
            title: "1.1 Account Information",
            items: [
              "Name, mobile number, email address, password (stored as a bcrypt hash), preferred language and role.",
              "State, district and address (for billing, checkout and KYC verification).",
            ],
          },
          {
            title: "1.2 KYC Information",
            items: [
              "Government-issued identity-document images and details (such as Aadhaar / PAN / Voter-ID), live selfie, and biometric/OTP confirmations as required for Digital or Manual KYC by RBI / NPCI.",
              "We process these via our licensed KYC partner and do not display sensitive numbers in plain text in your dashboard.",
            ],
          },
          {
            title: "1.3 Payment Information",
            items: [
              "Transaction ID, amount, status, scope (wallet / recharge / membership / Prime), gateway reference and timestamp.",
              "We DO NOT store full card numbers, CVV, UPI PIN, net-banking passwords or any payment credentials. These are handled by PhonePe.",
            ],
          },
          {
            title: "1.4 Recharge & DMT Data",
            items: [
              "Mobile / DTH / utility numbers being recharged, operator and circle, biller details, beneficiary name, account number, IFSC and bank for money transfers.",
              "Provider response, success / failure status and any reference numbers.",
            ],
          },
          {
            title: "1.5 Tool Usage Data",
            items: [
              "Files you upload to the Background Remover, PDF Editor, Prime Studio or ID Card Engine, and the resulting outputs.",
              "Where Prime Studio autosave is enabled, project files are stored in your account so you can resume editing.",
            ],
          },
          {
            title: "1.6 Device & Usage Data",
            items: [
              "IP address, device type, browser, operating system, language preference and approximate location (derived from IP).",
              "Pages visited, actions performed, error logs and timestamps — used for security, fraud prevention and product improvement.",
            ],
          },
        ],
      },
      {
        title: "2. How We Use Your Information",
        items: [
          "To create and manage your account and Prime / operator membership.",
          "To process recharges, money transfers, wallet top-ups and KYC.",
          "To process payments through PhonePe and to issue commission for eligible operator tiers.",
          "To deliver the digital tools (PDF Editor, Background Remover, Prime Studio, ID Card Engine) you choose to use.",
          "To respond to your support inquiries.",
          "To detect and prevent fraud, abuse and security incidents.",
          "To comply with applicable Indian law and regulatory requirements (RBI, NPCI, IT Act, etc.).",
          "To send essential service-related communications (transaction confirmations, security alerts, policy updates).",
        ],
      },
      {
        title: "3. KYC and Identity Verification",
        items: [
          "KYC documents and biometric data are used solely for identity verification and regulatory compliance.",
          "These are transmitted over encrypted channels to our authorised KYC partner.",
          "We do not sell, rent or share KYC data with marketers.",
          "We retain KYC records for the period required by RBI / NPCI guidelines, typically up to 5 years after account closure.",
        ],
      },
      {
        title: "4. Payment Processing",
        items: [
          "All payments (wallet top-up, Prime subscription, operator membership) are processed by PhonePe Payment Gateway.",
          "We receive only the transaction ID, status, gateway reference and amount — never your full card or UPI credentials.",
          "Refunds (where applicable, see Terms section 4) are returned to the in-app wallet, not to your bank or card.",
        ],
      },
      {
        title: "5. Recharge and Money-Transfer Data",
        items: [
          "Recharge and DMT data is shared with our provider partner A1Topup, telecom operators, billers and NPCI member banks strictly to complete the transaction.",
          "Money-transfer logs and beneficiary details are retained as per RBI guidelines (typically up to 8 years after the transaction date).",
        ],
      },
      {
        title: "6. Cookies and Local Storage",
        items: [
          "We use a small number of essential cookies and browser local-storage entries for authentication (JWT session), language preference and theme.",
          "We do not use third-party advertising or cross-site tracking cookies.",
          "You may clear cookies and local storage at any time through your browser settings; doing so will log you out.",
        ],
      },
      {
        title: "7. Third-Party Service Providers",
        body: "We share specific data with the following providers only to deliver our services. Each operates under its own privacy policy:",
        items: [
          "PhonePe — payment processing.",
          "A1Topup — recharge, DMT and KYC processing.",
          "NPCI / IMPS / NEFT member banks — money-transfer settlement.",
          "Remove.bg — Full-HD background removal (Prime).",
          "Google Gemini 2.5 Flash and Google Vision — OCR for PDF Editor smart-text.",
          "Pixabay, Unsplash, YouTube Data API — content discovery.",
          "Email service providers — transactional and support emails.",
        ],
      },
      {
        title: "8. Data Sharing and Disclosure",
        body: "We do not sell your personal data. We may disclose information only:",
        items: [
          "When required by law, court order, or a lawful request from a government / regulatory authority.",
          "To detect and prevent fraud, abuse or security incidents.",
          "To enforce our Terms of Service.",
          "To our service providers under strict confidentiality, only to the extent necessary to deliver the service.",
        ],
      },
      {
        title: "9. Data Retention",
        items: [
          "Account data: retained while your account is active, plus a reasonable post-closure period for legal and accounting purposes.",
          "KYC records: typically up to 5 years after account closure (per RBI / NPCI rules).",
          "Money-transfer and payment records: typically up to 8 years (per RBI rules).",
          "Tool-output files (PDF Editor, Background Remover, ID Card Engine): retained until you delete them or delete your account.",
          "Prime Studio projects: retained until you delete them, subject to autosave settings.",
        ],
      },
      {
        title: "10. Data Security",
        items: [
          "Passwords are hashed with bcrypt; we never store them in plain text.",
          "Sessions use signed JWT tokens.",
          "T-PIN is required for high-value money-transfer operations.",
          "All traffic between your browser and our servers is encrypted in transit (HTTPS).",
          "Despite reasonable safeguards, no system is 100% secure. Notify us immediately at " + EMAIL + " of any suspected breach involving your account.",
        ],
      },
      {
        title: "11. Children's Privacy",
        items: [
          "Our services are not intended for users under 18.",
          "We do not knowingly collect personal data from children. If you believe a child has provided data, please contact us so we can delete it.",
        ],
      },
      {
        title: "12. Your Rights",
        items: [
          "Access — request a copy of the personal data we hold about you.",
          "Correction — ask us to correct inaccurate or incomplete data.",
          "Deletion — request deletion of your account and personal data, subject to retention obligations stated above.",
          "Withdraw consent — for non-essential processing at any time.",
          "Lodge a complaint with the relevant data-protection authority in India.",
        ],
      },
      {
        title: "13. Changes to This Policy",
        items: [
          "We may update this Privacy Policy from time to time.",
          "Updated versions become effective when posted on this page.",
          "Material changes will be notified through the platform or by email where reasonably possible.",
        ],
      },
    ],
    contact: {
      title: "14. Grievance Officer and Contact",
      businessLine: `Data Controller: ${BRAND} (Sole Proprietorship, Udyam-registered CSC Operator)`,
      addressLabel: "Address:",
      address: ADDRESS,
      emailLabel: "Email:",
      email: EMAIL,
      grievanceLine:
        "Grievance Officer: For any privacy-related grievance, please write to the email above with the subject \"Grievance\". We will acknowledge within 48 hours and aim to resolve within 30 days as required under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021.",
    },
    footer: `© ${new Date().getFullYear()} ${BRAND}. All rights reserved.`,
  },

  gu: {
    title: "ગોપનીયતા નીતિ (Privacy Policy)",
    effectiveDate: `અમલ તારીખ: ${EFFECTIVE}`,
    lastUpdated: `છેલ્લે અપડેટ: ${EFFECTIVE}`,
    intro:
      `${BRAND} તમારી ગોપનીયતાનું સન્માન કરે છે. આ Privacy Policy સમજાવે છે કે અમે કયો personal data એકત્ર કરીએ છીએ, શા માટે, કેવી રીતે ઉપયોગ અને સુરક્ષિત રાખીએ છીએ — જ્યારે તમે https://smitcscinfo.com/ અથવા અમારી કોઈપણ સેવાઓનો ઉપયોગ કરો છો — Recharge Portal, Money Transfer, Wallet, KYC, ડિજિટલ ટૂલ્સ, Prime મેમ્બરશિપ, ઓપરેટર મેમ્બરશિપ અને YouTube ચેનલ "Smit CSC Info".`,
    sections: [
      {
        title: "૧. અમે કઈ માહિતી એકત્ર કરીએ છીએ",
        body: "અમારી સેવાઓ આપવા અને સુરક્ષિત રાખવા જરૂરી હોય તેટલી જ ઓછામાં ઓછી માહિતી અમે એકત્ર કરીએ છીએ.",
        subsections: [
          {
            title: "૧.૧ Account Information",
            items: [
              "નામ, મોબાઇલ નંબર, email, પાસવર્ડ (bcrypt hash સ્વરૂપે સ્ટોર), પસંદ ભાષા અને role.",
              "State, district અને સરનામું (billing, checkout અને KYC verification માટે).",
            ],
          },
          {
            title: "૧.૨ KYC Information",
            items: [
              "Digital અથવા Manual KYC માટે RBI/NPCI જરૂરિયાત મુજબ સરકારી ID દસ્તાવેજો અને વિગતો (દા.ત. Aadhaar/PAN/Voter-ID), live selfie, biometric/OTP confirmations.",
              "આ માહિતી લાઇસન્સ-ધારી KYC partner મારફતે process થાય છે; dashboard માં sensitive numbers plain text માં બતાવાતા નથી.",
            ],
          },
          {
            title: "૧.૩ Payment Information",
            items: [
              "Transaction ID, રકમ, status, scope (wallet/recharge/membership/Prime), gateway reference અને timestamp.",
              "અમે card નંબર, CVV, UPI PIN, net-banking પાસવર્ડ અથવા કોઈપણ payment credentials સ્ટોર નથી કરતા. એ બધું PhonePe handle કરે છે.",
            ],
          },
          {
            title: "૧.૪ Recharge અને DMT Data",
            items: [
              "Recharge થનાર mobile/DTH/utility number, operator અને circle, biller વિગતો, beneficiary નામ, account number, IFSC અને bank.",
              "Provider response, success/failure status અને reference numbers.",
            ],
          },
          {
            title: "૧.૫ Tool Usage Data",
            items: [
              "Background Remover, PDF Editor, Prime Studio અથવા ID Card Engine માં upload કરેલી files અને output.",
              "Prime Studio autosave ચાલુ હોય ત્યારે projects તમારા account માં સ્ટોર થાય છે — જેથી તમે edit ફરી શરૂ કરી શકો.",
            ],
          },
          {
            title: "૧.૬ Device અને Usage Data",
            items: [
              "IP address, device type, browser, OS, ભાષા preference અને approximate location (IP આધારિત).",
              "Visited pages, કરેલા actions, error logs અને timestamps — security, fraud prevention અને product improvement માટે.",
            ],
          },
        ],
      },
      {
        title: "૨. અમે માહિતીનો ઉપયોગ કેવી રીતે કરીએ છીએ",
        items: [
          "Account અને Prime/operator membership manage કરવા.",
          "Recharges, money transfers, wallet top-ups અને KYC process કરવા.",
          "PhonePe મારફતે payments process કરવા અને eligible ઓપરેટર tiers માટે commission આપવા.",
          "તમે પસંદ કરેલા ડિજિટલ ટૂલ્સ (PDF Editor, Background Remover, Prime Studio, ID Card Engine) deliver કરવા.",
          "Support inquiries નો જવાબ આપવા.",
          "Fraud, abuse અને security incidents detect અને prevent કરવા.",
          "ભારતીય કાયદા અને regulatory requirements (RBI, NPCI, IT Act વગેરે) સાથે અનુપાલન.",
          "જરૂરી service-related communications મોકલવા (transaction confirmation, security alert, policy update).",
        ],
      },
      {
        title: "૩. KYC અને ઓળખ Verification",
        items: [
          "KYC દસ્તાવેજો અને biometric data માત્ર ઓળખ verification અને regulatory compliance માટે વપરાય છે.",
          "આ encrypted channels મારફતે અધિકૃત KYC partner ને મોકલાય છે.",
          "અમે KYC data marketers ને sell, rent અથવા share નથી કરતા.",
          "RBI/NPCI guidelines મુજબ સામાન્ય રીતે account closure પછી 5 વર્ષ સુધી KYC records રાખીએ છીએ.",
        ],
      },
      {
        title: "૪. Payment Processing",
        items: [
          "બધા payments (wallet top-up, Prime subscription, ઓપરેટર membership) PhonePe Payment Gateway મારફતે process થાય છે.",
          "અમને માત્ર transaction ID, status, gateway reference અને રકમ મળે છે — full card અથવા UPI credentials ક્યારેય નહીં.",
          "Refund (જ્યાં લાગુ — Terms section 4 જુઓ) in-app wallet માં જ આવે છે, bank/card પર નહીં.",
        ],
      },
      {
        title: "૫. Recharge અને Money-Transfer Data",
        items: [
          "Transaction પૂર્ણ કરવા માટે જ recharge અને DMT data અમારા provider partner A1Topup, telecom operators, billers અને NPCI member banks સાથે share થાય છે.",
          "RBI guidelines મુજબ સામાન્ય રીતે transaction date પછી 8 વર્ષ સુધી money-transfer logs અને beneficiary વિગતો જાળવવામાં આવે છે.",
        ],
      },
      {
        title: "૬. Cookies અને Local Storage",
        items: [
          "Authentication (JWT session), ભાષા preference અને theme માટે અમે ઓછા આવશ્યક cookies અને browser local-storage entries વાપરીએ છીએ.",
          "Third-party advertising અથવા cross-site tracking cookies વાપરતા નથી.",
          "Browser settings મારફતે ગમે ત્યારે cookies/local storage clear કરી શકો છો — એ logout તરફ દોરી જશે.",
        ],
      },
      {
        title: "૭. Third-Party Service Providers",
        body: "અમારી સેવાઓ આપવા જરૂરી તેટલા જ data અમે નીચેના providers સાથે share કરીએ છીએ. દરેક પોતાની privacy policy હેઠળ કાર્ય કરે છે:",
        items: [
          "PhonePe — payment processing.",
          "A1Topup — recharge, DMT અને KYC processing.",
          "NPCI/IMPS/NEFT member બેંકો — money-transfer settlement.",
          "Remove.bg — Full-HD background removal (Prime).",
          "Google Gemini 2.5 Flash અને Google Vision — PDF Editor smart-text માટે OCR.",
          "Pixabay, Unsplash, YouTube Data API — content discovery.",
          "Email service providers — transactional અને support emails.",
        ],
      },
      {
        title: "૮. Data Sharing અને Disclosure",
        body: "અમે તમારો personal data sell નથી કરતા. માહિતી માત્ર નીચેના સંજોગોમાં share કરી શકીએ છીએ:",
        items: [
          "કાયદા, court order અથવા સરકારી/regulatory authority ની વાજબી માગણી હોય ત્યારે.",
          "Fraud, abuse અથવા security incidents detect/prevent કરવા.",
          "અમારી Terms of Service લાગુ પાડવા.",
          "અમારા service providers ને — સખત confidentiality હેઠળ, સેવા આપવા જરૂરી હોય તેટલી જ હદ સુધી.",
        ],
      },
      {
        title: "૯. Data Retention",
        items: [
          "Account data: account active હોય ત્યાં સુધી + કાનૂની/accounting હેતુઓ માટે વાજબી post-closure સમય સુધી.",
          "KYC records: સામાન્ય રીતે account closure પછી 5 વર્ષ સુધી (RBI/NPCI નિયમ).",
          "Money-transfer અને payment records: સામાન્ય રીતે 8 વર્ષ સુધી (RBI નિયમ).",
          "Tool-output files (PDF Editor, Background Remover, ID Card Engine): તમે delete કરો અથવા account delete કરો ત્યાં સુધી.",
          "Prime Studio projects: તમે delete કરો ત્યાં સુધી, autosave settings ને આધીન.",
        ],
      },
      {
        title: "૧૦. Data Security",
        items: [
          "પાસવર્ડ bcrypt hash સાથે સ્ટોર થાય છે — plain text માં ક્યારેય નહીં.",
          "Sessions signed JWT tokens વાપરે છે.",
          "High-value money-transfer માટે T-PIN જરૂરી છે.",
          "Browser અને server વચ્ચેનો બધો traffic encrypted (HTTPS) છે.",
          "વાજબી સુરક્ષાઓ છતાં, કોઈ system 100% secure નથી. Account સંબંધી શંકાસ્પદ breach ની તરત જ " + EMAIL + " પર જાણ કરો.",
        ],
      },
      {
        title: "૧૧. Children's Privacy",
        items: [
          "અમારી સેવાઓ 18 વર્ષથી ઓછી વયના users માટે નથી.",
          "અમે જાણીજોઈને બાળકો પાસેથી personal data એકત્ર નથી કરતા. જો કોઈ બાળકે data આપ્યો હોય તેવી શંકા હોય તો અમારો સંપર્ક કરો — અમે delete કરી દઈશું.",
        ],
      },
      {
        title: "૧૨. તમારા અધિકારો",
        items: [
          "Access — તમારા વિશે અમારી પાસે રહેલા personal data ની નકલ માગવી.",
          "Correction — ખોટા/અધૂરા data ને સુધારવાનું કહેવું.",
          "Deletion — account અને personal data ની delete કરવાની વિનંતી (ઉપર નોંધેલા retention obligations ને આધીન).",
          "બિન-આવશ્યક processing માટે consent ગમે ત્યારે પાછો ખેંચવો.",
          "ભારતની સંબંધિત data-protection authority પાસે ફરિયાદ નોંધાવવી.",
        ],
      },
      {
        title: "૧૩. આ Policy માં ફેરફાર",
        items: [
          "આ Privacy Policy સમય-સમય પર update થઈ શકે છે.",
          "આ page પર post થયે updated version અમલમાં આવે છે.",
          "Material ફેરફારની જાણ platform મારફતે અથવા email દ્વારા (જ્યાં વાજબી હોય ત્યાં) આપવામાં આવશે.",
        ],
      },
    ],
    contact: {
      title: "૧૪. Grievance Officer અને સંપર્ક",
      businessLine: `Data Controller: ${BRAND} (Sole Proprietorship, Udyam-registered CSC Operator)`,
      addressLabel: "સરનામું:",
      address: ADDRESS,
      emailLabel: "Email:",
      email: EMAIL,
      grievanceLine:
        "Grievance Officer: કોઈપણ privacy ફરિયાદ માટે ઉપરના email પર \"Grievance\" subject સાથે લખો. અમે 48 કલાકમાં acknowledge કરીશું અને Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021 મુજબ 30 દિવસમાં નિરાકરણનો પ્રયત્ન કરીશું.",
    },
    footer: `© ${new Date().getFullYear()} ${BRAND}. All rights reserved.`,
  },

  hi: {
    title: "गोपनीयता नीति (Privacy Policy)",
    effectiveDate: `प्रभावी तिथि: ${EFFECTIVE}`,
    lastUpdated: `अंतिम अपडेट: ${EFFECTIVE}`,
    intro:
      `${BRAND} आपकी गोपनीयता का सम्मान करता है। यह Privacy Policy बताती है कि हम कौन-सा personal data एकत्र करते हैं, क्यों, कैसे उपयोग और सुरक्षित रखते हैं — जब आप https://smitcscinfo.com/ या हमारी किसी भी सेवा का उपयोग करते हैं — Recharge Portal, Money Transfer, Wallet, KYC, डिजिटल टूल्स, Prime membership, ऑपरेटर membership और YouTube चैनल "Smit CSC Info"।`,
    sections: [
      {
        title: "1. हम कौन-सी जानकारी एकत्र करते हैं",
        body: "हम केवल वही न्यूनतम जानकारी एकत्र करते हैं जो हमारी सेवाएँ देने और सुरक्षित रखने के लिए आवश्यक है।",
        subsections: [
          {
            title: "1.1 Account Information",
            items: [
              "नाम, मोबाइल नंबर, email, password (bcrypt hash के रूप में store), पसंदीदा भाषा और role।",
              "State, district और पता (billing, checkout और KYC verification के लिए)।",
            ],
          },
          {
            title: "1.2 KYC Information",
            items: [
              "Digital या Manual KYC के लिए RBI/NPCI अनुसार सरकारी ID दस्तावेज़ और विवरण (जैसे Aadhaar/PAN/Voter-ID), live selfie, biometric/OTP confirmations।",
              "यह जानकारी licensed KYC partner के माध्यम से process होती है; sensitive numbers आपके dashboard में plain text में नहीं दिखते।",
            ],
          },
          {
            title: "1.3 Payment Information",
            items: [
              "Transaction ID, राशि, status, scope (wallet/recharge/membership/Prime), gateway reference और timestamp।",
              "हम card नंबर, CVV, UPI PIN, net-banking password या कोई भी payment credentials store नहीं करते। ये PhonePe handle करता है।",
            ],
          },
          {
            title: "1.4 Recharge और DMT Data",
            items: [
              "Recharge किए जा रहे mobile/DTH/utility number, operator और circle, biller विवरण, beneficiary नाम, account number, IFSC और bank।",
              "Provider response, success/failure status और reference numbers।",
            ],
          },
          {
            title: "1.5 Tool Usage Data",
            items: [
              "Background Remover, PDF Editor, Prime Studio या ID Card Engine पर upload की गई files और output।",
              "Prime Studio autosave सक्षम होने पर projects आपके account में store होते हैं — ताकि आप editing फिर से शुरू कर सकें।",
            ],
          },
          {
            title: "1.6 Device और Usage Data",
            items: [
              "IP address, device type, browser, OS, भाषा preference और approximate location (IP-derived)।",
              "देखे गए pages, किए गए actions, error logs और timestamps — security, fraud prevention और product improvement के लिए।",
            ],
          },
        ],
      },
      {
        title: "2. हम जानकारी का उपयोग कैसे करते हैं",
        items: [
          "Account और Prime/operator membership manage करना।",
          "Recharges, money transfers, wallet top-ups और KYC process करना।",
          "PhonePe के माध्यम से payments process करना और eligible ऑपरेटर tiers हेतु commission देना।",
          "आपके चुने हुए डिजिटल टूल्स (PDF Editor, Background Remover, Prime Studio, ID Card Engine) deliver करना।",
          "आपकी support inquiries का उत्तर देना।",
          "Fraud, abuse और security incidents detect व prevent करना।",
          "लागू भारतीय कानून और regulatory आवश्यकताओं (RBI, NPCI, IT Act आदि) का अनुपालन।",
          "आवश्यक service-related communications भेजना (transaction confirmation, security alert, policy update)।",
        ],
      },
      {
        title: "3. KYC और पहचान Verification",
        items: [
          "KYC दस्तावेज़ और biometric data केवल पहचान verification और regulatory compliance के लिए उपयोग होते हैं।",
          "ये encrypted channels के माध्यम से अधिकृत KYC partner को भेजे जाते हैं।",
          "हम KYC data marketers को sell, rent या share नहीं करते।",
          "RBI/NPCI guidelines के अनुसार आम तौर पर account closure के बाद 5 वर्ष तक KYC records रखे जाते हैं।",
        ],
      },
      {
        title: "4. Payment Processing",
        items: [
          "सभी payments (wallet top-up, Prime subscription, ऑपरेटर membership) PhonePe Payment Gateway से process होते हैं।",
          "हमें केवल transaction ID, status, gateway reference और राशि मिलती है — full card या UPI credentials कभी नहीं।",
          "Refund (जहाँ लागू — Terms section 4 देखें) in-app wallet में ही आता है, bank/card पर नहीं।",
        ],
      },
      {
        title: "5. Recharge और Money-Transfer Data",
        items: [
          "Transaction पूरा करने हेतु ही recharge और DMT data हमारे provider partner A1Topup, telecom operators, billers और NPCI member banks के साथ share होता है।",
          "RBI guidelines के अनुसार आम तौर पर transaction date के बाद 8 वर्ष तक money-transfer logs और beneficiary विवरण रखे जाते हैं।",
        ],
      },
      {
        title: "6. Cookies और Local Storage",
        items: [
          "Authentication (JWT session), भाषा preference और theme के लिए हम कुछ आवश्यक cookies और browser local-storage entries का उपयोग करते हैं।",
          "Third-party advertising या cross-site tracking cookies उपयोग नहीं करते।",
          "Browser settings से कभी भी cookies/local storage clear कर सकते हैं — इससे आप logout हो जाएँगे।",
        ],
      },
      {
        title: "7. Third-Party Service Providers",
        body: "अपनी सेवाएँ देने हेतु हम निम्न providers के साथ specific data share करते हैं। प्रत्येक की अपनी privacy policy है:",
        items: [
          "PhonePe — payment processing।",
          "A1Topup — recharge, DMT और KYC processing।",
          "NPCI/IMPS/NEFT member banks — money-transfer settlement।",
          "Remove.bg — Full-HD background removal (Prime)।",
          "Google Gemini 2.5 Flash और Google Vision — PDF Editor smart-text के लिए OCR।",
          "Pixabay, Unsplash, YouTube Data API — content discovery।",
          "Email service providers — transactional और support emails।",
        ],
      },
      {
        title: "8. Data Sharing और Disclosure",
        body: "हम आपका personal data sell नहीं करते। जानकारी केवल इन परिस्थितियों में disclose कर सकते हैं:",
        items: [
          "कानून, court order या सरकार/regulatory authority के विधिक अनुरोध पर।",
          "Fraud, abuse या security incidents detect/prevent करने हेतु।",
          "हमारी Terms of Service लागू करने हेतु।",
          "हमारे service providers को — strict confidentiality के तहत, सेवा देने हेतु आवश्यक हद तक।",
        ],
      },
      {
        title: "9. Data Retention",
        items: [
          "Account data: account active रहने तक + कानूनी/accounting उद्देश्यों हेतु उचित post-closure अवधि तक।",
          "KYC records: आम तौर पर account closure के बाद 5 वर्ष तक (RBI/NPCI नियम)।",
          "Money-transfer और payment records: आम तौर पर 8 वर्ष तक (RBI नियम)।",
          "Tool-output files (PDF Editor, Background Remover, ID Card Engine): जब तक आप delete न करें या account delete न करें।",
          "Prime Studio projects: जब तक आप delete न करें, autosave settings के अधीन।",
        ],
      },
      {
        title: "10. Data Security",
        items: [
          "Passwords bcrypt hash के साथ store होते हैं — plain text में कभी नहीं।",
          "Sessions signed JWT tokens का उपयोग करते हैं।",
          "High-value money-transfer के लिए T-PIN आवश्यक।",
          "Browser और server के बीच सारा traffic encrypted (HTTPS)।",
          "उचित सुरक्षा उपायों के बावजूद कोई system 100% secure नहीं। Account से जुड़े किसी संदिग्ध breach की तुरंत " + EMAIL + " पर सूचना दें।",
        ],
      },
      {
        title: "11. Children's Privacy",
        items: [
          "हमारी सेवाएँ 18 वर्ष से कम आयु के users हेतु नहीं हैं।",
          "हम जान-बूझकर बच्चों से personal data एकत्र नहीं करते। यदि किसी बच्चे ने data दिया हो तो हमसे संपर्क करें — हम delete कर देंगे।",
        ],
      },
      {
        title: "12. आपके अधिकार",
        items: [
          "Access — आपके विषय में हमारे पास रखे personal data की प्रति माँगना।",
          "Correction — गलत/अधूरे data को सुधारवाना।",
          "Deletion — account और personal data delete करवाने का अनुरोध (ऊपर बताए retention obligations के अधीन)।",
          "गैर-आवश्यक processing के लिए कभी भी consent वापस लेना।",
          "भारत की संबंधित data-protection authority के पास शिकायत दर्ज करना।",
        ],
      },
      {
        title: "13. इस Policy में परिवर्तन",
        items: [
          "यह Privacy Policy समय-समय पर update हो सकती है।",
          "इस page पर post होते ही updated version प्रभावी होगा।",
          "Material परिवर्तनों की सूचना platform के माध्यम से या email द्वारा (जहाँ उचित हो) दी जाएगी।",
        ],
      },
    ],
    contact: {
      title: "14. Grievance Officer और संपर्क",
      businessLine: `Data Controller: ${BRAND} (Sole Proprietorship, Udyam-registered CSC Operator)`,
      addressLabel: "पता:",
      address: ADDRESS,
      emailLabel: "Email:",
      email: EMAIL,
      grievanceLine:
        "Grievance Officer: किसी भी privacy शिकायत के लिए ऊपर दिए गए email पर \"Grievance\" subject सहित लिखें। हम 48 घंटे में acknowledge करेंगे और Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021 के अनुसार 30 दिनों में समाधान का प्रयास करेंगे।",
    },
    footer: `© ${new Date().getFullYear()} ${BRAND}. All rights reserved.`,
  },
};
