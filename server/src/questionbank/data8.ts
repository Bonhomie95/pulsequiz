/** Last 19. Kept separate so the build history stays legible. */
type F = { q: string; a: string; pool: string[]; d: 'easy' | 'medium' | 'hard' };

export const CHEM4: F[] = [
  { q: 'What is the chemical symbol for calcium?', a: 'Ca', pool: ['C', 'Cl', 'Cd'], d: 'easy' },
  { q: 'What is the chemical symbol for zinc?', a: 'Zn', pool: ['Zi', 'Z', 'Zr'], d: 'easy' },
  { q: 'What is the chemical symbol for tin?', a: 'Sn', pool: ['Ti', 'Tn', 'T'], d: 'easy' },
  { q: 'What is the chemical symbol for chlorine?', a: 'Cl', pool: ['Ch', 'C', 'Cr'], d: 'easy' },
  { q: 'What is the chemical symbol for sulphur?', a: 'S', pool: ['Su', 'Sl', 'Sr'], d: 'easy' },
  { q: 'What is the chemical symbol for magnesium?', a: 'Mg', pool: ['Ma', 'Mn', 'M'], d: 'easy' },
  { q: 'What is the chemical symbol for aluminium?', a: 'Al', pool: ['Am', 'A', 'Au'], d: 'easy' },
  { q: 'Which gas is essential for burning?', a: 'Oxygen', pool: ['Nitrogen', 'Carbon dioxide', 'Argon'], d: 'easy' },
  { q: 'What colour is pure copper metal?', a: 'Reddish-brown', pool: ['Silver-grey', 'Gold', 'Blue'], d: 'easy' },
  { q: 'Which everyday liquid is a weak acid?', a: 'Vinegar', pool: ['Bleach', 'Soap solution', 'Ammonia'], d: 'easy' },
  { q: 'Which everyday substance is a base?', a: 'Baking soda', pool: ['Vinegar', 'Lemon juice', 'Orange juice'], d: 'easy' },
  { q: 'What happens to sugar when stirred into hot water?', a: 'It dissolves', pool: ['It evaporates', 'It burns', 'It freezes'], d: 'easy' },
  { q: 'What is the chemical symbol for hydrogen?', a: 'H', pool: ['Hy', 'He', 'Hd'], d: 'easy' },
  { q: 'What is the chemical symbol for phosphorus?', a: 'P', pool: ['Ph', 'Po', 'Pr'], d: 'easy' },
  { q: 'Which metal is used in most electrical wiring?', a: 'Copper', pool: ['Iron', 'Lead', 'Nickel'], d: 'easy' },
  { q: 'What state is oxygen in at room temperature?', a: 'Gas', pool: ['Solid', 'Liquid', 'Plasma'], d: 'easy' },
];

export const MIXED4: F[] = [
  { q: 'What does antimatter do when it meets matter?', a: 'They annihilate, releasing energy', pool: ['They combine into a new element', 'They repel each other', 'Nothing happens'], d: 'hard' },
];

export const TECH4: F[] = [
  { q: 'What does a touchscreen respond to?', a: 'Touch', pool: ['Sound', 'Light only', 'Heat only'], d: 'easy' },
  { q: 'What does a charger do for a phone?', a: 'Refills the battery', pool: ['Speeds up the processor', 'Adds storage', 'Improves the camera'], d: 'easy' },
  { q: 'What is a URL?', a: 'The address of a web page', pool: ['A file format', 'A network cable', 'A browser setting'], d: 'medium' },
];

export const HIST4: F[] = [
  { q: 'Which sea did Moses reportedly cross in scripture?', a: 'The Red Sea', pool: ['The Dead Sea', 'The Mediterranean', 'The Black Sea'], d: 'medium' },
  { q: 'Which country did the Aztecs live in?', a: 'Mexico', pool: ['Peru', 'Colombia', 'Guatemala'], d: 'medium' },
  { q: 'Which explorer is credited with reaching India by sea from Europe?', a: 'Vasco da Gama', pool: ['Columbus', 'Magellan', 'Cabot'], d: 'medium' },
  { q: 'Which empire was ruled from Cusco?', a: 'The Inca Empire', pool: ['The Aztec Empire', 'The Maya', 'The Olmec'], d: 'medium' },
  { q: 'What was the Hundred Years War fought between?', a: 'England and France', pool: ['Spain and Portugal', 'Austria and Prussia', 'Russia and Sweden'], d: 'medium' },
];

export const SPORT4: F[] = [
  { q: 'What is a "century" in cricket?', a: 'One hundred runs by a batter', pool: ['One hundred balls bowled', 'A hundred-year-old club', 'A hundred overs'], d: 'medium' },
  { q: 'What is the "crease" in cricket?', a: 'A marked line at the batting end', pool: ['The boundary rope', 'The pitch centre', 'The bowler’s run-up'], d: 'medium' },
  { q: 'What is a "corner" in football awarded for?', a: 'The defending side putting the ball out over their goal line', pool: ['A foul in the box', 'Offside', 'A handball anywhere'], d: 'medium' },
  { q: 'What is a "throw-in" in football for?', a: 'Restarting after the ball crosses a touchline', pool: ['Restarting after a goal', 'Restarting after a foul', 'Starting the match'], d: 'medium' },
];

export const FOOD4: F[] = [
  { q: 'What does "simmer" mean?', a: 'Cook just below boiling', pool: ['Boil rapidly', 'Cook without heat', 'Fry at high heat'], d: 'medium' },
  { q: 'What does "zest" refer to in cooking?', a: 'The coloured outer peel of citrus', pool: ['The juice', 'The pith', 'The seeds'], d: 'medium' },
  { q: 'What does "score" mean when preparing meat?', a: 'Cutting shallow lines into the surface', pool: ['Weighing it', 'Rating its quality', 'Removing the bone'], d: 'medium' },
];

export const POP4: F[] = [
  { q: 'What is the "fourth wall" in theatre?', a: 'The imaginary barrier between stage and audience', pool: ['The back of the set', 'The curtain', 'The stage floor'], d: 'medium' },
  { q: 'What is "improvisation" in performance?', a: 'Performing without a script', pool: ['Rehearsing lines', 'Reading from a script', 'Miming to a recording'], d: 'medium' },
  { q: 'What is a "understudy" in theatre?', a: 'Someone who learns a role in case the lead cannot perform', pool: ['A stage technician', 'A trainee director', 'A ticket seller'], d: 'medium' },
  { q: 'What is "choreography"?', a: 'The design of dance movement', pool: ['The design of a set', 'The writing of lyrics', 'The lighting plan'], d: 'medium' },
];
