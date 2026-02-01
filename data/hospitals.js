// Israeli Hospitals List for CURresponse
const HOSPITALS = [
  // Central - Tel Aviv Area
  {
    id: 'shiba',
    name: 'שיבא - תל השומר',
    city: 'רמת גן',
    address: 'דרך שבע 2, תל השומר',
    region: 'center'
  },
  {
    id: 'ichilov',
    name: 'איכילוב - מרכז רפואי סוראסקי',
    city: 'תל אביב',
    address: 'ויצמן 6, תל אביב',
    region: 'center'
  },
  {
    id: 'wolfson',
    name: 'וולפסון',
    city: 'חולון',
    address: 'הלוחמים 62, חולון',
    region: 'center'
  },
  {
    id: 'assaf',
    name: 'אסף הרופא',
    city: 'צריפין',
    address: 'אסף הרופא, צריפין',
    region: 'center'
  },
  
  // Central - Sharon
  {
    id: 'beilinson',
    name: 'בילינסון - רבין',
    city: 'פתח תקווה',
    address: 'ז\'בוטינסקי 39, פתח תקווה',
    region: 'sharon'
  },
  {
    id: 'meir',
    name: 'מאיר',
    city: 'כפר סבא',
    address: 'תש"ח 59, כפר סבא',
    region: 'sharon'
  },
  {
    id: 'hasharon',
    name: 'השרון',
    city: 'פתח תקווה',
    address: 'קופת חולים 7, פתח תקווה',
    region: 'sharon'
  },
  {
    id: 'laniado',
    name: 'לניאדו',
    city: 'נתניה',
    address: 'רחוב הרצל 16, נתניה',
    region: 'sharon'
  },
  
  // Central South
  {
    id: 'kaplan',
    name: 'קפלן',
    city: 'רחובות',
    address: 'דרך פסטר 1, רחובות',
    region: 'center-south'
  },
  {
    id: 'shamir',
    name: 'שמיר - אסף הרופא',
    city: 'צריפין',
    address: 'כביש 44, צריפין',
    region: 'center-south'
  },
  {
    id: 'ashdod',
    name: 'אסותא אשדוד',
    city: 'אשדוד',
    address: 'הרוקמים 7, אשדוד',
    region: 'center-south'
  },
  
  // Jerusalem
  {
    id: 'hadassah-ein-kerem',
    name: 'הדסה עין כרם',
    city: 'ירושלים',
    address: 'קריית הדסה, עין כרם, ירושלים',
    region: 'jerusalem'
  },
  {
    id: 'hadassah-har-hatzofim',
    name: 'הדסה הר הצופים',
    city: 'ירושלים',
    address: 'הר הצופים, ירושלים',
    region: 'jerusalem'
  },
  {
    id: 'shaare-zedek',
    name: 'שערי צדק',
    city: 'ירושלים',
    address: 'שמואל הנגיד 12, ירושלים',
    region: 'jerusalem'
  },
  
  // North - Haifa Area
  {
    id: 'rambam',
    name: 'רמב"ם',
    city: 'חיפה',
    address: 'אפרון 8, חיפה',
    region: 'north'
  },
  {
    id: 'bnai-zion',
    name: 'בני ציון',
    city: 'חיפה',
    address: 'אלחדיף 47, חיפה',
    region: 'north'
  },
  {
    id: 'carmel',
    name: 'כרמל',
    city: 'חיפה',
    address: 'מיכל 7, חיפה',
    region: 'north'
  },
  
  // North - Galilee
  {
    id: 'nahariya',
    name: 'נהריה',
    city: 'נהריה',
    address: 'לחי 1, נהריה',
    region: 'north'
  },
  {
    id: 'ziv',
    name: 'זיו',
    city: 'צפת',
    address: 'רחי"ל 36, צפת',
    region: 'north'
  },
  {
    id: 'emek',
    name: 'העמק',
    city: 'עפולה',
    address: 'יצחק רבין, עפולה',
    region: 'north'
  },
  {
    id: 'poriya',
    name: 'פוריה',
    city: 'טבריה',
    address: 'פוריה עילית, טבריה',
    region: 'north'
  },
  
  // South
  {
    id: 'soroka',
    name: 'סורוקה',
    city: 'באר שבע',
    address: 'יצחק רגר, באר שבע',
    region: 'south'
  },
  {
    id: 'barzilai',
    name: 'ברזילי',
    city: 'אשקלון',
    address: 'החיל 2, אשקלון',
    region: 'south'
  },
  {
    id: 'yoseftal',
    name: 'יוספטל',
    city: 'אילת',
    address: 'יוטבתה, אילת',
    region: 'south'
  }
];

// Helper function to get hospital by ID
function getHospitalById(id) {
  return HOSPITALS.find(h => h.id === id);
}

// Helper function to get hospitals by region
function getHospitalsByRegion(region) {
  return HOSPITALS.filter(h => h.region === region);
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HOSPITALS, getHospitalById, getHospitalsByRegion };
}
