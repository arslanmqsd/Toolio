/** Word lists for the Fake Data Generator. Names are common given names and surnames from many countries. */

export const FIRST_NAMES: readonly string[] = [
  "Aaliyah", "Aarav", "Abigail", "Adam", "Adrian", "Aisha", "Alejandro", "Alex", "Alice", "Amara",
  "Amelia", "Ana", "Andrea", "Anika", "Arjun", "Ava", "Benjamin", "Bianca", "Camila", "Carlos",
  "Charlotte", "Chen", "Chloé", "Daniel", "David", "Diego", "Elena", "Eli", "Elijah", "Emily",
  "Emma", "Ethan", "Fatima", "Felix", "Freya", "Gabriel", "Grace", "Hana", "Hannah", "Harper",
  "Hiroshi", "Ibrahim", "Isabella", "Ivan", "Jack", "James", "Jamal", "Javier", "Jin", "José",
  "Julia", "Kai", "Kenji", "Laila", "Layla", "Leo", "Liam", "Lucas", "Lucía", "Luis",
  "Maya", "Mei", "Mia", "Mohammed", "Nadia", "Naomi", "Nia", "Noah", "Nora", "Olivia",
  "Omar", "Oscar", "Priya", "Rafael", "Ravi", "Riya", "Rosa", "Ryan", "Samuel", "Santiago",
  "Sara", "Sebastian", "Sofia", "Sophie", "Tariq", "Theo", "Thomas", "Valentina", "Victor", "William",
  "Yara", "Yusuf", "Zara", "Zoë",
];

export const LAST_NAMES: readonly string[] = [
  "Abbott", "Adams", "Ahmed", "Ali", "Alvarez", "Anderson", "Bailey", "Baker", "Bennett", "Brooks",
  "Brown", "Campbell", "Carter", "Castillo", "Chen", "Clark", "Collins", "Cooper", "Cruz", "Das",
  "Davis", "Diaz", "Edwards", "Evans", "Fischer", "Flores", "Foster", "García", "Gomez", "Gonzalez",
  "Gray", "Green", "Gupta", "Hall", "Harris", "Hayes", "Hernández", "Hill", "Hughes", "Ito",
  "Jackson", "Jensen", "Johnson", "Jones", "Kaur", "Khan", "Kim", "King", "Kowalski", "Kumar",
  "Lee", "Lewis", "Li", "Lopez", "Martin", "Martínez", "Mendoza", "Miller", "Moore", "Morales",
  "Müller", "Murphy", "Nakamura", "Nguyen", "Novak", "Okafor", "Ortiz", "Park", "Patel", "Perez",
  "Petrov", "Phillips", "Ramirez", "Reed", "Reyes", "Rivera", "Roberts", "Rodriguez", "Rossi", "Russo",
  "Sanchez", "Santos", "Schmidt", "Scott", "Shah", "Silva", "Singh", "Smith", "Sullivan", "Tanaka",
  "Taylor", "Thompson", "Torres", "Turner", "Walker", "Wang", "Ward", "Watson", "White", "Williams",
  "Wilson", "Wong", "Wright", "Yamamoto", "Young", "Zhang",
];

export const STREET_NAMES: readonly string[] = [
  "Maple", "Oak", "Pine", "Cedar", "Elm", "Willow", "Birch", "Walnut", "Chestnut", "Spruce",
  "Lake", "Hill", "Park", "River", "Sunset", "Meadow", "Forest", "Highland", "Valley", "Spring",
  "Washington", "Lincoln", "Jefferson", "Madison", "Franklin", "Main", "Church", "Mill", "Center", "Market",
  "Prospect", "Union", "Harbor", "Ridge", "Orchard", "Garden", "Bay", "Grove", "Liberty", "Summit",
];

export const STREET_TYPES: readonly string[] = ["St", "Ave", "Rd", "Blvd", "Ln", "Dr", "Ct", "Way", "Pl", "Ter"];

/** City, state, the first three digits of its ZIP codes, and its area code. */
export const CITIES: readonly (readonly [city: string, state: string, zip: string, areaCode: string])[] = [
  ["New York", "NY", "100", "212"], ["Brooklyn", "NY", "112", "718"], ["Buffalo", "NY", "142", "716"], ["Los Angeles", "CA", "900", "213"],
  ["San Francisco", "CA", "941", "415"], ["San Diego", "CA", "921", "619"], ["Sacramento", "CA", "958", "916"], ["Chicago", "IL", "606", "312"],
  ["Springfield", "IL", "627", "217"], ["Houston", "TX", "770", "713"], ["Austin", "TX", "787", "512"], ["Dallas", "TX", "752", "214"],
  ["San Antonio", "TX", "782", "210"], ["Phoenix", "AZ", "850", "602"], ["Tucson", "AZ", "857", "520"], ["Philadelphia", "PA", "191", "215"],
  ["Pittsburgh", "PA", "152", "412"], ["Columbus", "OH", "432", "614"], ["Cleveland", "OH", "441", "216"], ["Indianapolis", "IN", "462", "317"],
  ["Seattle", "WA", "981", "206"], ["Spokane", "WA", "992", "509"], ["Portland", "OR", "972", "503"], ["Denver", "CO", "802", "303"],
  ["Boulder", "CO", "803", "303"], ["Boston", "MA", "021", "617"], ["Cambridge", "MA", "021", "617"], ["Nashville", "TN", "372", "615"],
  ["Memphis", "TN", "381", "901"], ["Atlanta", "GA", "303", "404"], ["Savannah", "GA", "314", "912"], ["Miami", "FL", "331", "305"],
  ["Orlando", "FL", "328", "407"], ["Tampa", "FL", "336", "813"], ["Detroit", "MI", "482", "313"], ["Ann Arbor", "MI", "481", "734"],
  ["Minneapolis", "MN", "554", "612"], ["Madison", "WI", "537", "608"], ["Milwaukee", "WI", "532", "414"], ["Kansas City", "MO", "641", "816"],
  ["St. Louis", "MO", "631", "314"], ["Raleigh", "NC", "276", "919"], ["Charlotte", "NC", "282", "704"], ["Richmond", "VA", "232", "804"],
  ["Baltimore", "MD", "212", "410"], ["Salt Lake City", "UT", "841", "801"], ["Las Vegas", "NV", "891", "702"], ["Albuquerque", "NM", "871", "505"],
  ["New Orleans", "LA", "701", "504"], ["Louisville", "KY", "402", "502"], ["Omaha", "NE", "681", "402"], ["Honolulu", "HI", "968", "808"],
];

export const COMPANY_WORDS: readonly string[] = [
  "Acme", "Apex", "Atlas", "Beacon", "Blue Harbor", "Brightline", "Cascade", "Copper", "Crescent", "Evergreen",
  "Falcon", "Granite", "Horizon", "Ironwood", "Juniper", "Keystone", "Lighthouse", "Meridian", "Northwind", "Oakridge",
  "Orbit", "Pinnacle", "Quartz", "Redwood", "Silverline", "Summit", "Tidewater", "Vertex", "Willow Creek", "Zenith",
];

export const COMPANY_SUFFIXES: readonly string[] = ["Inc.", "LLC", "Group", "Labs", "Systems", "Partners", "Co.", "Technologies", "Studio", "Holdings"];

export const JOB_TITLES: readonly string[] = [
  "Software Engineer", "Senior Software Engineer", "Frontend Developer", "Backend Developer", "Engineering Manager",
  "Data Analyst", "Data Scientist", "Product Manager", "Product Designer", "UX Researcher",
  "QA Engineer", "DevOps Engineer", "Site Reliability Engineer", "Security Analyst", "Solutions Architect",
  "Technical Writer", "Marketing Manager", "Content Strategist", "Sales Representative", "Account Executive",
  "Customer Success Manager", "Support Specialist", "Operations Manager", "Project Coordinator", "Office Manager",
  "Financial Analyst", "Accountant", "HR Generalist", "Recruiter", "Chief Technology Officer",
  "Graphic Designer", "Business Analyst", "Legal Counsel", "Logistics Coordinator", "Research Scientist",
];

/** Domains reserved for examples (RFC 2606), so no generated address reaches a real inbox. */
export const EMAIL_DOMAINS: readonly string[] = ["example.com", "example.org", "example.net"];
