/**
 * Reference tables.
 *
 * Every "derived" question reads its answer straight out of one of these, so
 * checking the questions reduces to checking these tables — a few hundred rows
 * instead of a few thousand questions.
 *
 * Only stable facts belong here. Nothing that changes with an election, a
 * season, a census or a record attempt.
 */

// ── Geography ───────────────────────────────────────────────────────────────
export interface CountryRow {
  country: string;
  capital: string;
  continent: string;
  currency: string;
}

export const COUNTRIES: CountryRow[] = [
  { country: 'France', capital: 'Paris', continent: 'Europe', currency: 'Euro' },
  { country: 'Germany', capital: 'Berlin', continent: 'Europe', currency: 'Euro' },
  { country: 'Italy', capital: 'Rome', continent: 'Europe', currency: 'Euro' },
  { country: 'Spain', capital: 'Madrid', continent: 'Europe', currency: 'Euro' },
  { country: 'Portugal', capital: 'Lisbon', continent: 'Europe', currency: 'Euro' },
  { country: 'Greece', capital: 'Athens', continent: 'Europe', currency: 'Euro' },
  { country: 'Austria', capital: 'Vienna', continent: 'Europe', currency: 'Euro' },
  { country: 'Belgium', capital: 'Brussels', continent: 'Europe', currency: 'Euro' },
  { country: 'Netherlands', capital: 'Amsterdam', continent: 'Europe', currency: 'Euro' },
  { country: 'Ireland', capital: 'Dublin', continent: 'Europe', currency: 'Euro' },
  { country: 'Finland', capital: 'Helsinki', continent: 'Europe', currency: 'Euro' },
  { country: 'Norway', capital: 'Oslo', continent: 'Europe', currency: 'Norwegian krone' },
  { country: 'Sweden', capital: 'Stockholm', continent: 'Europe', currency: 'Swedish krona' },
  { country: 'Denmark', capital: 'Copenhagen', continent: 'Europe', currency: 'Danish krone' },
  { country: 'Iceland', capital: 'Reykjavik', continent: 'Europe', currency: 'Icelandic krona' },
  { country: 'Poland', capital: 'Warsaw', continent: 'Europe', currency: 'Polish zloty' },
  { country: 'Czechia', capital: 'Prague', continent: 'Europe', currency: 'Czech koruna' },
  { country: 'Hungary', capital: 'Budapest', continent: 'Europe', currency: 'Hungarian forint' },
  { country: 'Switzerland', capital: 'Bern', continent: 'Europe', currency: 'Swiss franc' },
  { country: 'Russia', capital: 'Moscow', continent: 'Europe', currency: 'Russian ruble' },
  { country: 'Ukraine', capital: 'Kyiv', continent: 'Europe', currency: 'Ukrainian hryvnia' },
  { country: 'Romania', capital: 'Bucharest', continent: 'Europe', currency: 'Romanian leu' },
  { country: 'Serbia', capital: 'Belgrade', continent: 'Europe', currency: 'Serbian dinar' },
  { country: 'Croatia', capital: 'Zagreb', continent: 'Europe', currency: 'Euro' },
  { country: 'United Kingdom', capital: 'London', continent: 'Europe', currency: 'Pound sterling' },

  { country: 'Japan', capital: 'Tokyo', continent: 'Asia', currency: 'Japanese yen' },
  { country: 'China', capital: 'Beijing', continent: 'Asia', currency: 'Chinese yuan' },
  { country: 'India', capital: 'New Delhi', continent: 'Asia', currency: 'Indian rupee' },
  { country: 'South Korea', capital: 'Seoul', continent: 'Asia', currency: 'South Korean won' },
  { country: 'Thailand', capital: 'Bangkok', continent: 'Asia', currency: 'Thai baht' },
  { country: 'Vietnam', capital: 'Hanoi', continent: 'Asia', currency: 'Vietnamese dong' },
  { country: 'Indonesia', capital: 'Jakarta', continent: 'Asia', currency: 'Indonesian rupiah' },
  { country: 'Malaysia', capital: 'Kuala Lumpur', continent: 'Asia', currency: 'Malaysian ringgit' },
  { country: 'Philippines', capital: 'Manila', continent: 'Asia', currency: 'Philippine peso' },
  { country: 'Pakistan', capital: 'Islamabad', continent: 'Asia', currency: 'Pakistani rupee' },
  { country: 'Bangladesh', capital: 'Dhaka', continent: 'Asia', currency: 'Bangladeshi taka' },
  { country: 'Nepal', capital: 'Kathmandu', continent: 'Asia', currency: 'Nepalese rupee' },
  { country: 'Sri Lanka', capital: 'Colombo', continent: 'Asia', currency: 'Sri Lankan rupee' },
  { country: 'Turkey', capital: 'Ankara', continent: 'Asia', currency: 'Turkish lira' },
  { country: 'Iran', capital: 'Tehran', continent: 'Asia', currency: 'Iranian rial' },
  { country: 'Iraq', capital: 'Baghdad', continent: 'Asia', currency: 'Iraqi dinar' },
  { country: 'Saudi Arabia', capital: 'Riyadh', continent: 'Asia', currency: 'Saudi riyal' },
  { country: 'Israel', capital: 'Jerusalem', continent: 'Asia', currency: 'Israeli shekel' },
  { country: 'Kazakhstan', capital: 'Astana', continent: 'Asia', currency: 'Kazakhstani tenge' },
  { country: 'Mongolia', capital: 'Ulaanbaatar', continent: 'Asia', currency: 'Mongolian tugrik' },

  { country: 'Egypt', capital: 'Cairo', continent: 'Africa', currency: 'Egyptian pound' },
  { country: 'Nigeria', capital: 'Abuja', continent: 'Africa', currency: 'Nigerian naira' },
  { country: 'Kenya', capital: 'Nairobi', continent: 'Africa', currency: 'Kenyan shilling' },
  { country: 'Ghana', capital: 'Accra', continent: 'Africa', currency: 'Ghanaian cedi' },
  { country: 'Ethiopia', capital: 'Addis Ababa', continent: 'Africa', currency: 'Ethiopian birr' },
  { country: 'Morocco', capital: 'Rabat', continent: 'Africa', currency: 'Moroccan dirham' },
  { country: 'Algeria', capital: 'Algiers', continent: 'Africa', currency: 'Algerian dinar' },
  { country: 'Tunisia', capital: 'Tunis', continent: 'Africa', currency: 'Tunisian dinar' },
  { country: 'Senegal', capital: 'Dakar', continent: 'Africa', currency: 'West African CFA franc' },
  { country: 'Tanzania', capital: 'Dodoma', continent: 'Africa', currency: 'Tanzanian shilling' },
  { country: 'Uganda', capital: 'Kampala', continent: 'Africa', currency: 'Ugandan shilling' },
  { country: 'Zimbabwe', capital: 'Harare', continent: 'Africa', currency: 'Zimbabwean dollar' },
  { country: 'Zambia', capital: 'Lusaka', continent: 'Africa', currency: 'Zambian kwacha' },
  { country: 'Botswana', capital: 'Gaborone', continent: 'Africa', currency: 'Botswana pula' },
  { country: 'Namibia', capital: 'Windhoek', continent: 'Africa', currency: 'Namibian dollar' },
  { country: 'Rwanda', capital: 'Kigali', continent: 'Africa', currency: 'Rwandan franc' },
  { country: 'Cameroon', capital: 'Yaounde', continent: 'Africa', currency: 'Central African CFA franc' },
  { country: 'Ivory Coast', capital: 'Yamoussoukro', continent: 'Africa', currency: 'West African CFA franc' },

  { country: 'United States', capital: 'Washington, D.C.', continent: 'North America', currency: 'US dollar' },
  { country: 'Canada', capital: 'Ottawa', continent: 'North America', currency: 'Canadian dollar' },
  { country: 'Mexico', capital: 'Mexico City', continent: 'North America', currency: 'Mexican peso' },
  { country: 'Cuba', capital: 'Havana', continent: 'North America', currency: 'Cuban peso' },
  { country: 'Jamaica', capital: 'Kingston', continent: 'North America', currency: 'Jamaican dollar' },
  { country: 'Panama', capital: 'Panama City', continent: 'North America', currency: 'Panamanian balboa' },
  { country: 'Costa Rica', capital: 'San Jose', continent: 'North America', currency: 'Costa Rican colon' },
  { country: 'Guatemala', capital: 'Guatemala City', continent: 'North America', currency: 'Guatemalan quetzal' },

  { country: 'Brazil', capital: 'Brasilia', continent: 'South America', currency: 'Brazilian real' },
  { country: 'Argentina', capital: 'Buenos Aires', continent: 'South America', currency: 'Argentine peso' },
  { country: 'Chile', capital: 'Santiago', continent: 'South America', currency: 'Chilean peso' },
  { country: 'Peru', capital: 'Lima', continent: 'South America', currency: 'Peruvian sol' },
  { country: 'Colombia', capital: 'Bogota', continent: 'South America', currency: 'Colombian peso' },
  { country: 'Venezuela', capital: 'Caracas', continent: 'South America', currency: 'Venezuelan bolivar' },
  { country: 'Ecuador', capital: 'Quito', continent: 'South America', currency: 'US dollar' },
  { country: 'Bolivia', capital: 'Sucre', continent: 'South America', currency: 'Bolivian boliviano' },
  { country: 'Uruguay', capital: 'Montevideo', continent: 'South America', currency: 'Uruguayan peso' },
  { country: 'Paraguay', capital: 'Asuncion', continent: 'South America', currency: 'Paraguayan guarani' },

  { country: 'Australia', capital: 'Canberra', continent: 'Oceania', currency: 'Australian dollar' },
  { country: 'New Zealand', capital: 'Wellington', continent: 'Oceania', currency: 'New Zealand dollar' },
  { country: 'Fiji', capital: 'Suva', continent: 'Oceania', currency: 'Fijian dollar' },
  { country: 'Papua New Guinea', capital: 'Port Moresby', continent: 'Oceania', currency: 'Papua New Guinean kina' },
];

/** Physical features — stable superlatives only, with the measure stated. */
export const LANDMARKS: { fact: string; answer: string; kind: string }[] = [
  { fact: 'the longest river in Africa', answer: 'The Nile', kind: 'river' },
  { fact: 'the longest river in South America', answer: 'The Amazon', kind: 'river' },
  { fact: 'the longest river in Asia', answer: 'The Yangtze', kind: 'river' },
  { fact: 'the longest river in Europe', answer: 'The Volga', kind: 'river' },
  { fact: 'the longest river in North America', answer: 'The Missouri', kind: 'river' },
  { fact: 'the highest mountain on Earth above sea level', answer: 'Mount Everest', kind: 'mountain' },
  { fact: 'the highest mountain in Africa', answer: 'Mount Kilimanjaro', kind: 'mountain' },
  { fact: 'the highest mountain in South America', answer: 'Aconcagua', kind: 'mountain' },
  { fact: 'the highest mountain in Europe', answer: 'Mount Elbrus', kind: 'mountain' },
  { fact: 'the highest mountain in North America', answer: 'Denali', kind: 'mountain' },
  { fact: 'the largest ocean', answer: 'The Pacific', kind: 'ocean' },
  { fact: 'the smallest ocean', answer: 'The Arctic', kind: 'ocean' },
  { fact: 'the largest desert on Earth', answer: 'The Antarctic Desert', kind: 'desert' },
  { fact: 'the largest hot desert', answer: 'The Sahara', kind: 'desert' },
  { fact: 'the largest island', answer: 'Greenland', kind: 'island' },
  { fact: 'the largest lake by surface area', answer: 'The Caspian Sea', kind: 'lake' },
  { fact: 'the deepest lake', answer: 'Lake Baikal', kind: 'lake' },
  { fact: 'the largest lake in Africa by area', answer: 'Lake Victoria', kind: 'lake' },
  { fact: 'the deepest point in the ocean', answer: 'The Mariana Trench', kind: 'trench' },
  { fact: 'the largest rainforest', answer: 'The Amazon', kind: 'rainforest' },
];

export const RIVERS = ['The Nile', 'The Amazon', 'The Yangtze', 'The Volga', 'The Missouri', 'The Danube', 'The Mekong', 'The Congo', 'The Ganges', 'The Rhine', 'The Zambezi', 'The Niger'];
export const MOUNTAINS = ['Mount Everest', 'K2', 'Mount Kilimanjaro', 'Aconcagua', 'Mount Elbrus', 'Denali', 'Mont Blanc', 'Matterhorn', 'Mount Fuji', 'Kangchenjunga'];
export const OCEANS = ['The Pacific', 'The Atlantic', 'The Indian', 'The Arctic', 'The Southern'];
export const DESERTS = ['The Sahara', 'The Gobi', 'The Kalahari', 'The Atacama', 'The Antarctic Desert', 'The Arabian Desert', 'The Mojave'];
export const ISLANDS = ['Greenland', 'New Guinea', 'Borneo', 'Madagascar', 'Baffin Island', 'Sumatra', 'Honshu'];
export const LAKES = ['The Caspian Sea', 'Lake Superior', 'Lake Victoria', 'Lake Baikal', 'Lake Tanganyika', 'Lake Michigan', 'Lake Malawi'];
export const TRENCHES = ['The Mariana Trench', 'The Tonga Trench', 'The Java Trench', 'The Puerto Rico Trench', 'The Philippine Trench'];
export const RAINFORESTS = ['The Amazon', 'The Congo Basin', 'The Daintree', 'The Valdivian', 'Borneo lowland forest'];

// ── Chemistry ───────────────────────────────────────────────────────────────
export interface ElementRow {
  name: string;
  symbol: string;
  number: number;
  category: string;
}

export const ELEMENTS: ElementRow[] = [
  { name: 'Hydrogen', symbol: 'H', number: 1, category: 'nonmetal' },
  { name: 'Helium', symbol: 'He', number: 2, category: 'noble gas' },
  { name: 'Lithium', symbol: 'Li', number: 3, category: 'alkali metal' },
  { name: 'Beryllium', symbol: 'Be', number: 4, category: 'alkaline earth metal' },
  { name: 'Boron', symbol: 'B', number: 5, category: 'metalloid' },
  { name: 'Carbon', symbol: 'C', number: 6, category: 'nonmetal' },
  { name: 'Nitrogen', symbol: 'N', number: 7, category: 'nonmetal' },
  { name: 'Oxygen', symbol: 'O', number: 8, category: 'nonmetal' },
  { name: 'Fluorine', symbol: 'F', number: 9, category: 'halogen' },
  { name: 'Neon', symbol: 'Ne', number: 10, category: 'noble gas' },
  { name: 'Sodium', symbol: 'Na', number: 11, category: 'alkali metal' },
  { name: 'Magnesium', symbol: 'Mg', number: 12, category: 'alkaline earth metal' },
  { name: 'Aluminium', symbol: 'Al', number: 13, category: 'post-transition metal' },
  { name: 'Silicon', symbol: 'Si', number: 14, category: 'metalloid' },
  { name: 'Phosphorus', symbol: 'P', number: 15, category: 'nonmetal' },
  { name: 'Sulfur', symbol: 'S', number: 16, category: 'nonmetal' },
  { name: 'Chlorine', symbol: 'Cl', number: 17, category: 'halogen' },
  { name: 'Argon', symbol: 'Ar', number: 18, category: 'noble gas' },
  { name: 'Potassium', symbol: 'K', number: 19, category: 'alkali metal' },
  { name: 'Calcium', symbol: 'Ca', number: 20, category: 'alkaline earth metal' },
  { name: 'Titanium', symbol: 'Ti', number: 22, category: 'transition metal' },
  { name: 'Chromium', symbol: 'Cr', number: 24, category: 'transition metal' },
  { name: 'Manganese', symbol: 'Mn', number: 25, category: 'transition metal' },
  { name: 'Iron', symbol: 'Fe', number: 26, category: 'transition metal' },
  { name: 'Cobalt', symbol: 'Co', number: 27, category: 'transition metal' },
  { name: 'Nickel', symbol: 'Ni', number: 28, category: 'transition metal' },
  { name: 'Copper', symbol: 'Cu', number: 29, category: 'transition metal' },
  { name: 'Zinc', symbol: 'Zn', number: 30, category: 'transition metal' },
  { name: 'Bromine', symbol: 'Br', number: 35, category: 'halogen' },
  { name: 'Krypton', symbol: 'Kr', number: 36, category: 'noble gas' },
  { name: 'Silver', symbol: 'Ag', number: 47, category: 'transition metal' },
  { name: 'Tin', symbol: 'Sn', number: 50, category: 'post-transition metal' },
  { name: 'Iodine', symbol: 'I', number: 53, category: 'halogen' },
  { name: 'Xenon', symbol: 'Xe', number: 54, category: 'noble gas' },
  { name: 'Tungsten', symbol: 'W', number: 74, category: 'transition metal' },
  { name: 'Platinum', symbol: 'Pt', number: 78, category: 'transition metal' },
  { name: 'Gold', symbol: 'Au', number: 79, category: 'transition metal' },
  { name: 'Mercury', symbol: 'Hg', number: 80, category: 'transition metal' },
  { name: 'Lead', symbol: 'Pb', number: 82, category: 'post-transition metal' },
  { name: 'Uranium', symbol: 'U', number: 92, category: 'actinide' },
];

export const COMPOUNDS: { name: string; formula: string }[] = [
  { name: 'water', formula: 'H2O' },
  { name: 'carbon dioxide', formula: 'CO2' },
  { name: 'table salt', formula: 'NaCl' },
  { name: 'methane', formula: 'CH4' },
  { name: 'ammonia', formula: 'NH3' },
  { name: 'ozone', formula: 'O3' },
  { name: 'hydrogen peroxide', formula: 'H2O2' },
  { name: 'sulfuric acid', formula: 'H2SO4' },
  { name: 'hydrochloric acid', formula: 'HCl' },
  { name: 'nitric acid', formula: 'HNO3' },
  { name: 'sodium hydroxide', formula: 'NaOH' },
  { name: 'calcium carbonate', formula: 'CaCO3' },
  { name: 'glucose', formula: 'C6H12O6' },
  { name: 'ethanol', formula: 'C2H5OH' },
  { name: 'acetic acid', formula: 'CH3COOH' },
  { name: 'carbon monoxide', formula: 'CO' },
  { name: 'nitrous oxide', formula: 'N2O' },
  { name: 'sulfur dioxide', formula: 'SO2' },
  { name: 'baking soda', formula: 'NaHCO3' },
  { name: 'rust (iron(III) oxide)', formula: 'Fe2O3' },
];

// ── Physics ─────────────────────────────────────────────────────────────────
export const SI_UNITS: { quantity: string; unit: string; symbol: string }[] = [
  { quantity: 'force', unit: 'newton', symbol: 'N' },
  { quantity: 'energy', unit: 'joule', symbol: 'J' },
  { quantity: 'power', unit: 'watt', symbol: 'W' },
  { quantity: 'pressure', unit: 'pascal', symbol: 'Pa' },
  { quantity: 'frequency', unit: 'hertz', symbol: 'Hz' },
  { quantity: 'electric current', unit: 'ampere', symbol: 'A' },
  { quantity: 'electric charge', unit: 'coulomb', symbol: 'C' },
  { quantity: 'voltage', unit: 'volt', symbol: 'V' },
  { quantity: 'electrical resistance', unit: 'ohm', symbol: 'Ω' },
  { quantity: 'capacitance', unit: 'farad', symbol: 'F' },
  { quantity: 'inductance', unit: 'henry', symbol: 'H' },
  { quantity: 'magnetic flux density', unit: 'tesla', symbol: 'T' },
  { quantity: 'temperature', unit: 'kelvin', symbol: 'K' },
  { quantity: 'length', unit: 'metre', symbol: 'm' },
  { quantity: 'mass', unit: 'kilogram', symbol: 'kg' },
  { quantity: 'time', unit: 'second', symbol: 's' },
  { quantity: 'amount of substance', unit: 'mole', symbol: 'mol' },
  { quantity: 'luminous intensity', unit: 'candela', symbol: 'cd' },
  { quantity: 'radioactivity', unit: 'becquerel', symbol: 'Bq' },
  { quantity: 'absorbed radiation dose', unit: 'gray', symbol: 'Gy' },
];

export const PHYSICS_LAWS: { law: string; describes: string }[] = [
  { law: "Ohm's law", describes: 'the relationship between voltage, current and resistance' },
  { law: "Hooke's law", describes: 'the extension of a spring under load' },
  { law: "Boyle's law", describes: 'pressure and volume of a gas at constant temperature' },
  { law: "Charles's law", describes: 'volume and temperature of a gas at constant pressure' },
  { law: "Coulomb's law", describes: 'the force between two electric charges' },
  { law: "Newton's second law", describes: 'force as mass times acceleration' },
  { law: "Faraday's law", describes: 'induced voltage from a changing magnetic field' },
  { law: "Archimedes' principle", describes: 'the buoyant force on a submerged object' },
  { law: "Bernoulli's principle", describes: 'pressure and speed in a moving fluid' },
  { law: "Snell's law", describes: 'the bending of light between two media' },
];

export const SCIENTISTS: { person: string; forWhat: string; field: string }[] = [
  { person: 'Isaac Newton', forWhat: 'the laws of motion and universal gravitation', field: 'physics' },
  { person: 'Albert Einstein', forWhat: 'the theory of relativity', field: 'physics' },
  { person: 'Marie Curie', forWhat: 'pioneering research on radioactivity', field: 'physics' },
  { person: 'Niels Bohr', forWhat: 'the model of the atom with electron shells', field: 'physics' },
  { person: 'Max Planck', forWhat: 'the origin of quantum theory', field: 'physics' },
  { person: 'Michael Faraday', forWhat: 'electromagnetic induction', field: 'physics' },
  { person: 'James Clerk Maxwell', forWhat: 'the equations of electromagnetism', field: 'physics' },
  { person: 'Werner Heisenberg', forWhat: 'the uncertainty principle', field: 'physics' },
  { person: 'Galileo Galilei', forWhat: 'early telescopic astronomy', field: 'physics' },
  { person: 'Charles Darwin', forWhat: 'evolution by natural selection', field: 'biology' },
  { person: 'Gregor Mendel', forWhat: 'the laws of inheritance', field: 'biology' },
  { person: 'Louis Pasteur', forWhat: 'germ theory and pasteurisation', field: 'biology' },
  { person: 'Alexander Fleming', forWhat: 'the discovery of penicillin', field: 'biology' },
  { person: 'Rosalind Franklin', forWhat: 'X-ray images that revealed DNA structure', field: 'biology' },
  { person: 'Dmitri Mendeleev', forWhat: 'the periodic table', field: 'chemistry' },
  { person: 'Antoine Lavoisier', forWhat: 'the law of conservation of mass', field: 'chemistry' },
  { person: 'Ada Lovelace', forWhat: 'the first published computer algorithm', field: 'technology' },
  { person: 'Alan Turing', forWhat: 'foundational work in computer science', field: 'technology' },
];

// ── Planets ─────────────────────────────────────────────────────────────────
export const PLANETS = [
  'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune',
];
