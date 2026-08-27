/**
 * Reference tables for the remaining categories.
 *
 * Same principle as data.ts: encode the fact once, generate many questions
 * from it. Checking a 40-row table is tractable; checking 200 loose questions
 * is not.
 *
 * Nothing here changes with an election, a season or a record.
 */

// ── Biology ─────────────────────────────────────────────────────────────────
export const ORGANS: { organ: string; job: string; system: string }[] = [
  { organ: 'heart', job: 'pumping blood around the body', system: 'circulatory' },
  { organ: 'lungs', job: 'exchanging oxygen and carbon dioxide', system: 'respiratory' },
  { organ: 'liver', job: 'filtering toxins and producing bile', system: 'digestive' },
  { organ: 'kidneys', job: 'filtering waste from the blood', system: 'urinary' },
  { organ: 'stomach', job: 'breaking down food with acid', system: 'digestive' },
  { organ: 'pancreas', job: 'producing insulin', system: 'endocrine' },
  { organ: 'brain', job: 'processing thought and controlling the body', system: 'nervous' },
  { organ: 'skin', job: 'protecting the body and regulating temperature', system: 'integumentary' },
  { organ: 'spleen', job: 'filtering blood and storing white blood cells', system: 'lymphatic' },
  { organ: 'small intestine', job: 'absorbing nutrients from food', system: 'digestive' },
  { organ: 'large intestine', job: 'absorbing water from digested food', system: 'digestive' },
  { organ: 'bladder', job: 'storing urine', system: 'urinary' },
  { organ: 'thyroid', job: 'regulating metabolism', system: 'endocrine' },
  { organ: 'oesophagus', job: 'carrying food from the throat to the stomach', system: 'digestive' },
  { organ: 'diaphragm', job: 'driving breathing', system: 'respiratory' },
];

export const ANIMAL_CLASSES: { animal: string; group: string }[] = [
  { animal: 'Frog', group: 'Amphibian' }, { animal: 'Salamander', group: 'Amphibian' },
  { animal: 'Newt', group: 'Amphibian' }, { animal: 'Toad', group: 'Amphibian' },
  { animal: 'Crocodile', group: 'Reptile' }, { animal: 'Tortoise', group: 'Reptile' },
  { animal: 'Chameleon', group: 'Reptile' }, { animal: 'Python', group: 'Reptile' },
  { animal: 'Dolphin', group: 'Mammal' }, { animal: 'Bat', group: 'Mammal' },
  { animal: 'Platypus', group: 'Mammal' }, { animal: 'Whale', group: 'Mammal' },
  { animal: 'Penguin', group: 'Bird' }, { animal: 'Ostrich', group: 'Bird' },
  { animal: 'Eagle', group: 'Bird' }, { animal: 'Owl', group: 'Bird' },
  { animal: 'Shark', group: 'Fish' }, { animal: 'Salmon', group: 'Fish' },
  { animal: 'Seahorse', group: 'Fish' }, { animal: 'Eel', group: 'Fish' },
  { animal: 'Spider', group: 'Arachnid' }, { animal: 'Scorpion', group: 'Arachnid' },
  { animal: 'Butterfly', group: 'Insect' }, { animal: 'Ant', group: 'Insect' },
  { animal: 'Octopus', group: 'Mollusc' }, { animal: 'Snail', group: 'Mollusc' },
];

export const ANIMAL_GROUP_NAMES: { animal: string; collective: string }[] = [
  { animal: 'lions', collective: 'a pride' }, { animal: 'wolves', collective: 'a pack' },
  { animal: 'crows', collective: 'a murder' }, { animal: 'geese in flight', collective: 'a skein' },
  { animal: 'fish', collective: 'a school' }, { animal: 'cattle', collective: 'a herd' },
  { animal: 'sheep', collective: 'a flock' }, { animal: 'bees', collective: 'a swarm' },
  { animal: 'puppies', collective: 'a litter' }, { animal: 'whales', collective: 'a pod' },
  { animal: 'owls', collective: 'a parliament' }, { animal: 'kittens', collective: 'a kindle' },
];

// ── Technology ──────────────────────────────────────────────────────────────
export const TECH_ACRONYMS: { acronym: string; meaning: string }[] = [
  { acronym: 'CPU', meaning: 'Central Processing Unit' },
  { acronym: 'RAM', meaning: 'Random Access Memory' },
  { acronym: 'ROM', meaning: 'Read Only Memory' },
  { acronym: 'USB', meaning: 'Universal Serial Bus' },
  { acronym: 'HTML', meaning: 'HyperText Markup Language' },
  { acronym: 'CSS', meaning: 'Cascading Style Sheets' },
  { acronym: 'HTTP', meaning: 'HyperText Transfer Protocol' },
  { acronym: 'URL', meaning: 'Uniform Resource Locator' },
  { acronym: 'PDF', meaning: 'Portable Document Format' },
  { acronym: 'GPS', meaning: 'Global Positioning System' },
  { acronym: 'GPU', meaning: 'Graphics Processing Unit' },
  { acronym: 'SSD', meaning: 'Solid State Drive' },
  { acronym: 'API', meaning: 'Application Programming Interface' },
  { acronym: 'SQL', meaning: 'Structured Query Language' },
  { acronym: 'JSON', meaning: 'JavaScript Object Notation' },
  { acronym: 'DNS', meaning: 'Domain Name System' },
  { acronym: 'VPN', meaning: 'Virtual Private Network' },
  { acronym: 'LAN', meaning: 'Local Area Network' },
  { acronym: 'IP', meaning: 'Internet Protocol' },
  { acronym: 'AI', meaning: 'Artificial Intelligence' },
  { acronym: 'OS', meaning: 'Operating System' },
  { acronym: 'PNG', meaning: 'Portable Network Graphics' },
  { acronym: 'XML', meaning: 'Extensible Markup Language' },
  { acronym: 'FTP', meaning: 'File Transfer Protocol' },
];

export const LANGUAGES: { language: string; creator: string; year: string; useFor: string }[] = [
  { language: 'Python', creator: 'Guido van Rossum', year: '1991', useFor: 'general-purpose scripting and data work' },
  { language: 'JavaScript', creator: 'Brendan Eich', year: '1995', useFor: 'programming in web browsers' },
  { language: 'Java', creator: 'James Gosling', year: '1995', useFor: 'cross-platform enterprise software' },
  { language: 'C', creator: 'Dennis Ritchie', year: '1972', useFor: 'systems programming' },
  { language: 'C++', creator: 'Bjarne Stroustrup', year: '1985', useFor: 'performance-critical applications' },
  { language: 'Ruby', creator: 'Yukihiro Matsumoto', year: '1995', useFor: 'web applications' },
  { language: 'PHP', creator: 'Rasmus Lerdorf', year: '1995', useFor: 'server-side web pages' },
  { language: 'Go', creator: 'Robert Griesemer, Rob Pike and Ken Thompson', year: '2009', useFor: 'concurrent server software' },
  { language: 'Rust', creator: 'Graydon Hoyre', year: '2010', useFor: 'memory-safe systems programming' },
  { language: 'Swift', creator: 'Chris Lattner', year: '2014', useFor: 'Apple platform apps' },
];

export const FILE_EXTENSIONS: { ext: string; kind: string }[] = [
  { ext: '.jpg', kind: 'an image' }, { ext: '.mp3', kind: 'an audio file' },
  { ext: '.mp4', kind: 'a video file' }, { ext: '.pdf', kind: 'a document' },
  { ext: '.zip', kind: 'a compressed archive' }, { ext: '.exe', kind: 'a Windows program' },
  { ext: '.css', kind: 'a stylesheet' }, { ext: '.py', kind: 'a Python script' },
  { ext: '.html', kind: 'a web page' }, { ext: '.csv', kind: 'a spreadsheet of plain text' },
];

export const TECH_FOUNDERS: { company: string; founder: string }[] = [
  { company: 'Microsoft', founder: 'Bill Gates and Paul Allen' },
  { company: 'Apple', founder: 'Steve Jobs and Steve Wozniak' },
  { company: 'Amazon', founder: 'Jeff Bezos' },
  { company: 'Tesla Motors', founder: 'Martin Eberhard and Marc Tarpenning' },
  { company: 'Facebook', founder: 'Mark Zuckerberg' },
  { company: 'Google', founder: 'Larry Page and Sergey Brin' },
  { company: 'Oracle', founder: 'Larry Ellison' },
  { company: 'Intel', founder: 'Robert Noyce and Gordon Moore' },
  { company: 'IBM', founder: 'Charles Ranlett Flint' },
  { company: 'Netflix', founder: 'Reed Hastings and Marc Randolph' },
];

// ── History ─────────────────────────────────────────────────────────────────
export const EVENTS: { event: string; year: string; era: 'easy' | 'medium' | 'hard' }[] = [
  { event: 'the end of World War II', year: '1945', era: 'easy' },
  { event: 'the start of World War I', year: '1914', era: 'easy' },
  { event: 'the sinking of the Titanic', year: '1912', era: 'easy' },
  { event: 'the first Moon landing', year: '1969', era: 'easy' },
  { event: 'the fall of the Berlin Wall', year: '1989', era: 'easy' },
  { event: 'the American Declaration of Independence', year: '1776', era: 'easy' },
  { event: 'the start of the French Revolution', year: '1789', era: 'medium' },
  { event: 'the end of the American Civil War', year: '1865', era: 'medium' },
  { event: 'the dissolution of the Soviet Union', year: '1991', era: 'medium' },
  { event: 'the Battle of Hastings', year: '1066', era: 'medium' },
  { event: 'the sealing of Magna Carta', year: '1215', era: 'medium' },
  { event: 'the Cuban Missile Crisis', year: '1962', era: 'medium' },
  { event: "Columbus's first Atlantic crossing", year: '1492', era: 'medium' },
  { event: 'the Ottoman capture of Constantinople', year: '1453', era: 'hard' },
  { event: 'the eruption that buried Pompeii', year: 'AD 79', era: 'hard' },
  { event: 'the signing of the Treaty of Versailles', year: '1919', era: 'hard' },
  { event: 'the discovery of Tutankhamun’s tomb', year: '1922', era: 'hard' },
  { event: 'the first powered flight by the Wright brothers', year: '1903', era: 'medium' },
];

export const LEADERS: { person: string; role: string }[] = [
  { person: 'George Washington', role: 'the first President of the United States' },
  { person: 'Winston Churchill', role: 'British Prime Minister for most of World War II' },
  { person: 'Nelson Mandela', role: "South Africa's first democratically elected president" },
  { person: 'Mahatma Gandhi', role: "the leader of India's non-violent independence movement" },
  { person: 'Julius Caesar', role: 'the Roman general assassinated in 44 BC' },
  { person: 'Augustus', role: 'the first Roman Emperor' },
  { person: 'Cleopatra', role: 'the last active pharaoh of Egypt' },
  { person: 'Alexander the Great', role: 'the Macedonian king who conquered Persia' },
  { person: 'Napoleon Bonaparte', role: 'the French emperor defeated at Waterloo' },
  { person: 'Abraham Lincoln', role: 'the US president during the American Civil War' },
  { person: 'Qin Shi Huang', role: 'the first emperor of a unified China' },
  { person: 'Joseph Stalin', role: 'the Soviet leader during World War II' },
  { person: 'Queen Victoria', role: 'the British monarch who reigned for 63 years' },
  { person: 'Mansa Musa', role: 'the ruler of the Mali Empire famed for his wealth' },
  { person: 'Suleiman the Magnificent', role: 'the longest-reigning Ottoman sultan' },
];

export const CIVILISATIONS: { thing: string; who: string }[] = [
  { thing: 'the Colosseum', who: 'The Romans' },
  { thing: 'Machu Picchu', who: 'The Inca' },
  { thing: 'the Great Wall', who: 'The Chinese' },
  { thing: 'the Pyramids of Giza', who: 'The Egyptians' },
  { thing: 'Tenochtitlan', who: 'The Aztecs' },
  { thing: 'Stonehenge', who: 'Neolithic Britons' },
  { thing: 'Petra', who: 'The Nabataeans' },
  { thing: 'Angkor Wat', who: 'The Khmer Empire' },
  { thing: 'the Parthenon', who: 'The Greeks' },
  { thing: 'Chichen Itza', who: 'The Maya' },
];

// ── Sports ──────────────────────────────────────────────────────────────────
export const SPORT_TEAMS: { sport: string; players: string }[] = [
  { sport: 'football (soccer)', players: '11' }, { sport: 'basketball', players: '5' },
  { sport: 'volleyball', players: '6' }, { sport: 'ice hockey', players: '6' },
  { sport: 'baseball', players: '9' }, { sport: 'rugby union', players: '15' },
  { sport: 'rugby league', players: '13' }, { sport: 'cricket', players: '11' },
  { sport: 'water polo', players: '7' }, { sport: 'netball', players: '7' },
  { sport: 'handball', players: '7' }, { sport: 'American football', players: '11' },
];

export const SPORT_EQUIPMENT: { sport: string; item: string }[] = [
  { sport: 'tennis', item: 'a racket' }, { sport: 'golf', item: 'clubs' },
  { sport: 'ice hockey', item: 'a puck' }, { sport: 'archery', item: 'a bow' },
  { sport: 'fencing', item: 'a foil' }, { sport: 'badminton', item: 'a shuttlecock' },
  { sport: 'bowling', item: 'pins' }, { sport: 'snooker', item: 'a cue' },
  { sport: 'boxing', item: 'gloves' }, { sport: 'curling', item: 'a stone and broom' },
];

export const SPORT_TERMS: { term: string; sport: string }[] = [
  { term: 'a hat-trick', sport: 'football' }, { term: 'a slam dunk', sport: 'basketball' },
  { term: 'a birdie', sport: 'golf' }, { term: 'a knockout', sport: 'boxing' },
  { term: 'love', sport: 'tennis' }, { term: 'a scrum', sport: 'rugby' },
  { term: 'a home run', sport: 'baseball' }, { term: 'a googly', sport: 'cricket' },
  { term: 'a peloton', sport: 'cycling' }, { term: 'a pin', sport: 'wrestling' },
  { term: 'a spare', sport: 'bowling' }, { term: 'a checkmate', sport: 'chess' },
];

// ── Food & Cooking ──────────────────────────────────────────────────────────
export const DISH_ORIGINS: { dish: string; country: string }[] = [
  { dish: 'Sushi', country: 'Japan' }, { dish: 'Paella', country: 'Spain' },
  { dish: 'Pad Thai', country: 'Thailand' }, { dish: 'Goulash', country: 'Hungary' },
  { dish: 'Moussaka', country: 'Greece' }, { dish: 'Pierogi', country: 'Poland' },
  { dish: 'Ceviche', country: 'Peru' }, { dish: 'Tagine', country: 'Morocco' },
  { dish: 'Borscht', country: 'Ukraine' }, { dish: 'Croissant', country: 'France' },
  { dish: 'Jollof rice', country: 'Nigeria' }, { dish: 'Biryani', country: 'India' },
  { dish: 'Pho', country: 'Vietnam' }, { dish: 'Kimchi', country: 'South Korea' },
  { dish: 'Tiramisu', country: 'Italy' }, { dish: 'Poutine', country: 'Canada' },
  { dish: 'Falafel', country: 'Egypt' }, { dish: 'Empanada', country: 'Argentina' },
  { dish: 'Schnitzel', country: 'Austria' }, { dish: 'Injera', country: 'Ethiopia' },
];

export const INGREDIENT_SOURCE: { ingredient: string; source: string }[] = [
  { ingredient: 'Saffron', source: 'a crocus flower' },
  { ingredient: 'Vanilla', source: 'an orchid pod' },
  { ingredient: 'Cinnamon', source: 'tree bark' },
  { ingredient: 'Maple syrup', source: 'tree sap' },
  { ingredient: 'Olive oil', source: 'pressed fruit' },
  { ingredient: 'Chocolate', source: 'cacao beans' },
  { ingredient: 'Honey', source: 'flower nectar' },
  { ingredient: 'Tofu', source: 'soybeans' },
  { ingredient: 'Ghee', source: 'clarified butter' },
  { ingredient: 'Marzipan', source: 'ground almonds' },
];

export const COOKING_TERMS: { term: string; meaning: string }[] = [
  { term: 'Blanch', meaning: 'to boil briefly then plunge into cold water' },
  { term: 'Sauté', meaning: 'to fry quickly in a little fat' },
  { term: 'Braise', meaning: 'to sear then cook slowly in liquid' },
  { term: 'Julienne', meaning: 'to cut into thin matchsticks' },
  { term: 'Poach', meaning: 'to cook gently in barely simmering liquid' },
  { term: 'Marinate', meaning: 'to soak in a seasoned liquid before cooking' },
  { term: 'Whisk', meaning: 'to beat rapidly to add air' },
  { term: 'Knead', meaning: 'to work dough to develop gluten' },
  { term: 'Caramelise', meaning: 'to brown sugar by heating it' },
  { term: 'Fold', meaning: 'to combine gently without knocking out air' },
  { term: 'Sear', meaning: 'to brown a surface quickly at high heat' },
  { term: 'Reduce', meaning: 'to thicken a liquid by simmering it down' },
];

// ── Pop Culture (settled works only — nothing current) ──────────────────────
export const AUTHORS: { work: string; author: string }[] = [
  { work: 'Romeo and Juliet', author: 'William Shakespeare' },
  { work: 'Pride and Prejudice', author: 'Jane Austen' },
  { work: 'Nineteen Eighty-Four', author: 'George Orwell' },
  { work: 'The Old Man and the Sea', author: 'Ernest Hemingway' },
  { work: 'Things Fall Apart', author: 'Chinua Achebe' },
  { work: 'To Kill a Mockingbird', author: 'Harper Lee' },
  { work: 'The Hobbit', author: 'J. R. R. Tolkien' },
  { work: 'Great Expectations', author: 'Charles Dickens' },
  { work: 'Don Quixote', author: 'Miguel de Cervantes' },
  { work: 'War and Peace', author: 'Leo Tolstoy' },
  { work: 'Frankenstein', author: 'Mary Shelley' },
  { work: 'The Great Gatsby', author: 'F. Scott Fitzgerald' },
  { work: 'Moby-Dick', author: 'Herman Melville' },
  { work: 'Brave New World', author: 'Aldous Huxley' },
  { work: 'Jane Eyre', author: 'Charlotte Brontë' },
];

export const ARTISTS: { work: string; artist: string }[] = [
  { work: 'the Mona Lisa', artist: 'Leonardo da Vinci' },
  { work: 'The Starry Night', artist: 'Vincent van Gogh' },
  { work: 'The Persistence of Memory', artist: 'Salvador Dalí' },
  { work: 'Guernica', artist: 'Pablo Picasso' },
  { work: 'The Scream', artist: 'Edvard Munch' },
  { work: 'the ceiling of the Sistine Chapel', artist: 'Michelangelo' },
  { work: 'The Birth of Venus', artist: 'Sandro Botticelli' },
  { work: 'Girl with a Pearl Earring', artist: 'Johannes Vermeer' },
  { work: 'The Night Watch', artist: 'Rembrandt' },
  { work: 'American Gothic', artist: 'Grant Wood' },
];

export const COMPOSERS: { work: string; composer: string }[] = [
  { work: 'the Ninth Symphony', composer: 'Ludwig van Beethoven' },
  { work: 'The Four Seasons', composer: 'Antonio Vivaldi' },
  { work: 'The Magic Flute', composer: 'Wolfgang Amadeus Mozart' },
  { work: 'The Nutcracker', composer: 'Pyotr Ilyich Tchaikovsky' },
  { work: 'Messiah', composer: 'George Frideric Handel' },
  { work: 'The Rite of Spring', composer: 'Igor Stravinsky' },
  { work: 'Clair de Lune', composer: 'Claude Debussy' },
  { work: 'The Blue Danube', composer: 'Johann Strauss II' },
];

export const MYTHOLOGY: { figure: string; domain: string; pantheon: string }[] = [
  { figure: 'Zeus', domain: 'the sky and thunder', pantheon: 'Greek' },
  { figure: 'Poseidon', domain: 'the sea', pantheon: 'Greek' },
  { figure: 'Hades', domain: 'the underworld', pantheon: 'Greek' },
  { figure: 'Athena', domain: 'wisdom and warfare', pantheon: 'Greek' },
  { figure: 'Ares', domain: 'war', pantheon: 'Greek' },
  { figure: 'Aphrodite', domain: 'love and beauty', pantheon: 'Greek' },
  { figure: 'Apollo', domain: 'the sun, music and prophecy', pantheon: 'Greek' },
  { figure: 'Thor', domain: 'thunder', pantheon: 'Norse' },
  { figure: 'Odin', domain: 'wisdom and war', pantheon: 'Norse' },
  { figure: 'Loki', domain: 'mischief', pantheon: 'Norse' },
  { figure: 'Ra', domain: 'the sun', pantheon: 'Egyptian' },
  { figure: 'Anubis', domain: 'mummification and the afterlife', pantheon: 'Egyptian' },
];

// ── General Knowledge ───────────────────────────────────────────────────────
export const COLOURS_MIX: { mix: string; result: string }[] = [
  { mix: 'blue and yellow', result: 'Green' },
  { mix: 'red and blue', result: 'Purple' },
  { mix: 'red and yellow', result: 'Orange' },
  { mix: 'black and white', result: 'Grey' },
  { mix: 'red and white', result: 'Pink' },
];

export const MISC_FACTS: { question: string; answer: string; pool: string[]; difficulty: 'easy' | 'medium' | 'hard' }[] = [
  { question: 'How many sides does a hexagon have?', answer: 'Six', pool: ['Five', 'Seven', 'Eight', 'Four'], difficulty: 'easy' },
  { question: 'How many days are in a leap year?', answer: '366', pool: ['365', '364', '367', '360'], difficulty: 'easy' },
  { question: 'How many minutes are in a full day?', answer: '1,440', pool: ['1,200', '1,600', '2,400', '960'], difficulty: 'medium' },
  { question: 'How many letters are in the English alphabet?', answer: '26', pool: ['24', '25', '27', '28'], difficulty: 'easy' },
  { question: 'How many colours are in a rainbow?', answer: 'Seven', pool: ['Six', 'Five', 'Eight', 'Nine'], difficulty: 'easy' },
  { question: 'How many strings does a standard guitar have?', answer: 'Six', pool: ['Four', 'Five', 'Seven', 'Twelve'], difficulty: 'easy' },
  { question: 'How many squares are on a chessboard?', answer: '64', pool: ['81', '100', '49', '36'], difficulty: 'medium' },
  { question: 'How many players are on a chess board at the start?', answer: '32 pieces', pool: ['16 pieces', '24 pieces', 'available 64 pieces', '20 pieces'], difficulty: 'medium' },
  { question: 'What is the most spoken first language in the world?', answer: 'Mandarin Chinese', pool: ['English', 'Spanish', 'Hindi', 'Arabic'], difficulty: 'medium' },
  { question: 'How many degrees are in a circle?', answer: '360', pool: ['180', '270', '400', '90'], difficulty: 'easy' },
  { question: 'How many bones does a newborn baby have, roughly?', answer: 'About 300', pool: ['About 206', 'About 150', 'About 400', 'About 100'], difficulty: 'hard' },
  { question: 'What is the largest planet in the Solar System?', answer: 'Jupiter', pool: ['Saturn', 'Neptune', 'Uranus', 'Earth'], difficulty: 'easy' },
  { question: 'How many time zones does the world have?', answer: '24', pool: ['12', '36', '48', '20'], difficulty: 'medium' },
  { question: 'What is the freezing point of water in Fahrenheit?', answer: '32 °F', pool: ['0 °F', '100 °F', '212 °F', '-32 °F'], difficulty: 'medium' },
  { question: 'How many wonders are in the classical ancient world list?', answer: 'Seven', pool: ['Five', 'Nine', 'Ten', 'Twelve'], difficulty: 'easy' },
  { question: 'What is the Roman numeral for 50?', answer: 'L', pool: ['C', 'D', 'X', 'V'], difficulty: 'medium' },
  { question: 'What is the Roman numeral for 100?', answer: 'C', pool: ['L', 'D', 'M', 'X'], difficulty: 'medium' },
  { question: 'What is the Roman numeral for 1000?', answer: 'M', pool: ['C', 'D', 'L', 'X'], difficulty: 'hard' },
  { question: 'How many players are in a standard deck of cards?', answer: '52 cards', pool: ['48 cards', '54 cards', '60 cards', '40 cards'], difficulty: 'easy' },
  { question: 'How many sides does a dodecagon have?', answer: '12', pool: ['10', '11', '14', '20'], difficulty: 'hard' },
];
