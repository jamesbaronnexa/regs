export const AS_NZS_3000_TOC = [
  // Section 1
  { section: "1", title: "SCOPE, APPLICATION AND FUNDAMENTAL PRINCIPLES", page: 33, level: 1 },
  { section: "1.1", title: "SCOPE", page: 33, level: 2 },
  { section: "1.2", title: "APPLICATION", page: 33, level: 2 },
  { section: "1.3", title: "REFERENCED DOCUMENTS", page: 34, level: 2 },
  { section: "1.4", title: "DEFINITIONS", page: 34, level: 2 },
  { section: "1.5", title: "FUNDAMENTAL PRINCIPLES", page: 54, level: 2 },
  { section: "1.5.1", title: "Protection against dangers and damage", page: 54, level: 3 },
  { section: "1.5.2", title: "Control and isolation", page: 55, level: 3 },
  { section: "1.5.3", title: "Protection against electric shock", page: 55, level: 3 },
  
  // Section 2
  { section: "2", title: "GENERAL ARRANGEMENT, CONTROL AND PROTECTION", page: 75, level: 1 },
  { section: "2.1", title: "GENERAL", page: 75, level: 2 },
  { section: "2.1.1", title: "Application", page: 75, level: 3 },
  { section: "2.1.2", title: "Selection and installation", page: 75, level: 3 },
  
  // Section 6 - Critical for testing
  { section: "6", title: "DAMP SITUATIONS", page: 316, level: 1 },
  { section: "6.1", title: "GENERAL", page: 316, level: 2 },
  { section: "6.1.1", title: "Application", page: 316, level: 3 },
  { section: "6.1.2", title: "Selection and installation", page: 316, level: 3 },
  { section: "6.2", title: "BATHS, SHOWERS AND OTHER FIXED WATER CONTAINERS", page: 317, level: 2 },
  { section: "6.2.1", title: "Scope", page: 317, level: 3 },
  { section: "6.2.2", title: "Classification of zones", page: 317, level: 3 },
  { section: "6.2.3", title: "Protection against electric shock—Prohibited measures", page: 320, level: 3 },
  { section: "6.2.4", title: "Selection and installation of electrical equipment", page: 320, level: 3 },
  { section: "6.3", title: "SWIMMING POOLS, PADDLING POOLS AND SPA POOLS OR TUBS", page: 336, level: 2 },
  { section: "6.3.1", title: "Scope", page: 336, level: 3 },
  { section: "6.3.2", title: "Classification of zones", page: 337, level: 3 },
  { section: "6.3.3", title: "Protection against electric shock", page: 338, level: 3 },
  { section: "6.3.4", title: "Selection and installation of electrical equipment", page: 339, level: 3 },
  
  // Add more sections as needed
]

export function getParentSection(sectionNumber) {
  const parts = sectionNumber.split('.')
  if (parts.length <= 1) return null
  parts.pop()
  return parts.join('.')
}