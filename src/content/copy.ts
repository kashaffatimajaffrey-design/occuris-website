// Every string on the page lives here. Change words in this file only;
// components read from it and never carry their own text.
// Owner: Kashaf. Source: PRD sections 4, 12, 13 and 15.
// Lines marked DRAFT were not in the PRD and need a human to confirm them.

export const contact = {
  // Switch to hello@occuris.ai once Cloudflare Email Routing is live.
  email: 'occurisai@gmail.com',
  emailSubject: 'Hello Occuris', // DRAFT: subject line pre-filled in the compose window
  office: 'Bahria University, Karachi',
};

export const links = {
  // Empty links are hidden. github.com/occuris-ai does not exist yet; paste the
  // organisation URL here when it does.
  github: '',
  linkedin: 'https://www.linkedin.com/company/occurisai/',
  substack: 'https://kashaf00.substack.com/',
  echoDemo: 'https://www.loom.com/share/6bd1cf3edd624f7abde12051eb732f79',
};

export const tagline =
  'AI agents for supply chain and operations teams, from ERP data to WhatsApp, deployed on your own servers.';

export const meta = {
  title: 'Occuris AI: AI agents for operations, supply chain and security, on your own servers',
  description: tagline,
  ogAlt: 'A supply chain drawn as a hanging chain of six nodes, with the Occuris tagline.',
};

export const nav = {
  skip: 'Skip to content',
  home: 'Occuris, back to top',
  wordmark: 'Occuris',
  label: 'Main',
  links: [
    { label: 'System', href: '#system' },
    { label: 'Occuralog', href: '#occuralog' },
    { label: 'Command', href: '#command' },
    { label: 'Echo', href: '#echo' },
    { label: 'Private', href: '#private' },
    { label: 'Contact', href: '#contact' },
  ],
  cta: 'Talk to us',
};

export const hero = {
  headline: ['Your operations run on WhatsApp.', 'Your decisions shouldn’t.'],
  subline: tagline,
  sublineMore: 'Also built to order: security operations, voice interfaces and private AI for regulated teams.',
  cta: 'Talk to us',
  hint: 'Click a road on the map to block it, and watch Occuris work around it.', // DRAFT
  // The alert raised when each link of the chain breaks, Supplier to Customer (section 15).
  // On the map, link 3 is the Hyderabad road, so the bypass alert sits there.
  alerts: [
    'Supplier shipment missed sailing. Next vessel in 9 days. Stock covers 6.',
    'Customs hold on 3 containers. Line stops in 4 days. Alternate: 120 units at Warehouse B.',
    'Warehouse A below reorder point: 30 cartons left, 7 days of demand. Reorder 400 raised for approval.',
    'Transit delay, Hyderabad bypass closed. ETA +4 hours. No line impact. Rerouted.',
    'Dispatch not confirmed for PO-1187. Customer SLA breach in 2 days.',
  ],
  mapLabel:
    'An illustrated map of a supply chain from a supplier in Dubai, by sea to Karachi port, through customs and Warehouse A, to the line in Hyderabad and a customer in Sukkur. Trucks move along the roads and WhatsApp messages pop up from them; Occuris reads each one and turns it into a record.',
};

// Place names on the map
export const places = {
  dubai: 'Dubai · supplier',
  port: 'Karachi Port',
  customs: 'Customs',
  warehouse: 'Warehouse A',
  line: 'Line · Hyderabad',
  customer: 'Customer · Sukkur',
  lahore: 'Lahore · copper',
};

// The eight messages of one day. `from` is where on the map it comes from,
// `marks` are the phrases Occuris picks out, `chip` is the record it becomes.
export const messages = [
  { who: 'Ahmed, dispatch', time: '07:42', from: 'truck-3-0', text: 'truck late hai, 200 carton kal pohnchenge', marks: ['truck late', '200 carton', 'kal'], chip: ['Cartons', '200', 'ETA tomorrow', 'delay 1 day', '0.94'] },
  { who: 'Port agent', time: '09:15', from: 'port', text: 'port se clearance abhi tak nahi mili, 3 container ruke hue hain', marks: ['clearance', '3 container', 'ruke'], chip: ['Containers', '3', 'Blocked', '0.91'] },
  { who: 'Supplier, Lahore', time: '11:30', from: 'lahore', text: 'supplier bol raha hai copper wire ka rate 12% barh gaya', marks: ['copper wire', '12% barh'], chip: ['Copper wire', 'Price +12%', '0.88'] },
  { who: 'Store', time: '14:05', from: 'warehouse', text: 'stock khatam hone wala hai, 30 carton bacha hai sirf', marks: ['stock khatam', '30 carton'], chip: ['Cartons', '30', 'Stock-out risk', '0.95'] },
  { who: 'Driver', time: '16:40', from: 'truck-3-1', text: 'driver ne bola Hyderabad bypass band hai, 4 ghante extra', marks: ['Hyderabad bypass band', '4 ghante'], chip: ['Truck', '+4 hours', '0.89'] },
  { who: 'Supplier, Dubai', time: '18:10', from: 'plane', text: 'generator ka spare part Dubai se aa raha hai, 10 din lagenge', marks: ['spare part', '10 din'], chip: ['Generator spare', '1', 'Air freight', '10 days', '0.93'] },
  { who: 'Receiving', time: '19:30', from: 'warehouse', text: '2 pallet damage hain, photo bhej raha hoon', marks: ['2 pallet damage', 'photo'], chip: ['Pallets', '2', 'Damage', '0.90'] },
  { who: 'Warehouse A', time: '20:05', from: 'truck-4-0', text: '50 bag cement aaj load ho gaye, raat tak Sukkur', marks: ['50 bag cement', 'raat tak'], chip: ['Cement, bags', '50', 'Tonight', '0.97'] },
];

// One day, told as it happens. DRAFT: the times and story lines are staging
// for the sample rows in section 15; confirm before launch.
export const story = {
  label: 'One day in Karachi',
  skip: 'Skip to products', // shown on phones only
  hud: { messages: 'messages read', records: 'records', decisions: 'decisions' },
  without: 'Without Occuris',
  with: 'Occuris',
  beats: [
    {
      time: '06:58',
      title: 'One day at a distributor in Karachi.',
      body: 'Eight messages will arrive between breakfast and dinner, in Urdu, English and both at once. Each one hides a decision with a deadline. Scroll through the day with Occuris reading along.',
    },
    {
      time: '07:42',
      who: 'Ahmed, dispatch',
      msg: 0,
      title: 'The truck is late. The message says so, in Roman Urdu.',
      without: 'It waits in a group chat until someone scrolls past it at eleven.',
      decision: 'Occuralog logged 200 cartons, arriving tomorrow, one day late. Stock covers it. No action needed.',
    },
    {
      time: '09:15',
      who: 'Port agent',
      msg: 1,
      title: 'Three containers are stuck at the port.',
      without: 'The agent sends one line. It reaches the right person after lunch.',
      decision: 'Customs hold on 3 containers. Line stops in 4 days. Alternate: 120 units at Warehouse B.',
    },
    {
      time: '11:30',
      who: 'Supplier, Lahore',
      msg: 2,
      title: 'Copper just went up 12%.',
      without: 'The supplier mentions it in passing. Nobody reprices the next order.',
      decision: 'Supplier risk: copper wire price up 12% at Lahore supplier. 2 alternates found within 8%.',
    },
    {
      time: '14:05',
      who: 'Store',
      msg: 3,
      title: 'The sheet says 230. The store says 30.',
      without: 'Bilal last updated stock.xlsx on Sunday. The store is talking about today.',
      decision: 'Warehouse A below reorder point: 30 cartons left, 7 days of demand. Reorder 400 raised for approval.',
    },
    {
      time: '16:40',
      who: 'Driver',
      msg: 4,
      title: 'The Hyderabad bypass is closed.',
      without: 'The driver says it at a petrol stop. Head office finds out when the truck does not arrive.',
      decision: 'Transit delay, Hyderabad bypass closed. ETA +4 hours. No line impact. Rerouted.',
    },
    {
      time: '18:10',
      who: 'Supplier, Dubai',
      msg: 5,
      title: 'The spare part is in the air.',
      without: 'Ten days, says Dubai. Fourteen days of life left in the old unit, says nobody.',
      decision: 'Inventory: generator spare arrives in 10 days. Current unit end-of-life in 14. Margin: 4 days.',
    },
    {
      time: '19:30',
      who: 'Receiving',
      msg: 6,
      title: 'Two pallets arrive damaged.',
      without: 'The photos sit in a chat. The claim window closes quietly.',
      decision: 'Compliance: 2 damaged pallets logged with photos. Claim window closes in 48 hours.',
    },
    {
      time: '20:05',
      who: 'Warehouse A',
      msg: 7,
      title: 'Eight messages. Eight records. Six decisions.',
      body: 'The last truck of cement leaves for Sukkur on time. Nobody re-typed anything, and nothing left the building. Every one of those six decisions is logged with the message that caused it. Tomorrow it starts again at 7:42.',
    },
  ],
};

export const system = {
  eyebrow: 'One system, three parts',
  headline: 'Read it. Decide it. Act on it.',
  body: 'Occuralog reads what your team already writes, in Urdu, English or both. Command decides what to do about it and watches your supply chain around the clock. Echo lets anyone act on a decision in one spoken sentence. All three run on your own servers.',
  inputs: ['WhatsApp', 'Spreadsheets', 'Email', 'ERP'],
  parts: [
    { name: 'Occuralog', line: 'messages to records' },
    { name: 'Command', line: 'records to decisions' },
    { name: 'Echo', line: 'decisions to actions, by voice' },
  ],
  outputs: ['Alerts', 'Approvals', 'Reports'],
  frame: 'YOUR SERVERS',
  note: 'Each part works alone. Together they close the loop between a message and a decision.',
  diagramLabel:
    'WhatsApp, spreadsheets, email and ERP flow into Occuralog, which turns messages into records; Command turns records into decisions; Echo turns decisions into actions by voice. Out come alerts, approvals and reports. All of it sits inside your servers.',
};

export const occuralog = {
  eyebrow: 'Occuralog',
  headline: 'No ERP required.',
  body: 'Occuralog turns the Urdu-English WhatsApp messages your team already sends into structured records that systems like SAP never see.',
  recordOpen: 'See a sample record',
  recordClose: 'Hide the sample record',
  recordTitle: 'Record 0001, parsed from WhatsApp',
  recordKeys: {
    source: 'source',
    item: 'item',
    qty: 'quantity',
    from: 'from',
    vehicle: 'vehicle',
    eta: 'eta',
    delay: 'delay',
    confidence: 'confidence',
  },
  columns: ['Message', 'Item', 'Qty', 'From', 'Vehicle', 'ETA', 'Flag'],
  tableCaption: 'Eight WhatsApp messages from a test thread, parsed by Occuralog.',
  canvasLabel:
    'Two thousand loose particles drift like scattered messages, then line up into the eight rows of the table below.',
  replay: 'Replay', // DRAFT: button that scatters the rows back into particles
  status: '{n} records · 1 WhatsApp thread · mean confidence {avg}', // DRAFT: footer under the table
};

export const command = {
  eyebrow: 'Occuris Command',
  headline: 'Six agents watching your supply chain so you don’t have to.',
  body: 'Procurement, inventory, supplier risk, compliance, forecasting and reporting, reasoning across your data in real time, and flagging risk before it becomes a delay.',
  outcomes: [
    'Flags the late shipment before the line stops.',
    'Finds two alternate suppliers when a price jumps.',
    'Raises the reorder before the shelf is empty.',
  ],
  agents: ['Procurement', 'Inventory', 'Supplier risk', 'Compliance', 'Forecasting', 'Reporting'],
  // The flow diagram: where data comes from, the hub, where decisions go
  sources: ['WhatsApp', 'Spreadsheets', 'Email', 'ERP'],
  core: 'Your data',
  outputs: ['Alerts', 'Approvals', 'Reports'],
  // which output each agent feeds, in the order of `agents`
  feeds: [1, 0, 0, 0, 2, 2],
  diagramLabel:
    'A flow diagram: WhatsApp, spreadsheets, email and ERP feed your data; six agents read it; alerts, approvals and reports come out. When an agent finds a risk, its stream turns amber and the alert is typed below.',
  // Each loop: the agent that raised it, then the alert line (section 15).
  alerts: [
    { agent: 'Supplier risk', text: 'Supplier risk: copper wire price up 12% at Lahore supplier. 2 alternates found within 8%.' },
    { agent: 'Inventory', text: 'Inventory: generator spare arrives in 10 days. Current unit end-of-life in 14. Margin: 4 days.' },
    { agent: 'Compliance', text: 'Compliance: 2 damaged pallets logged with photos. Claim window closes in 48 hours.' },
  ],
  timezone: 'Asia/Karachi',
  timezoneLabel: 'PKT',
};

export const echo = {
  eyebrow: 'Occuris Echo',
  headline: 'Approve it with your voice.',
  body: 'Echo is a voice-first agent. Say one sentence and it acts across email, calendar, Slack and spreadsheets: approve the reorder, reply to the supplier, move the meeting. It was built first for people who cannot easily use a keyboard or a screen. It turns out to be useful to anyone whose hands are full.',
  points: [
    'Asks before anything irreversible. No message is sent without your yes.',
    'Reports what actually happened, not what it intended to do.',
    '57 of 57 known-answer tests passed, with zero silent failures.',
  ],
  demo: 'Watch the 90-second demo',
  listening: 'Listening',
  heard: 'Heard',
  said: '“Approve the 400 carton reorder and tell Ahmed it ships Thursday.”',
  steps: [
    { time: '20:06:02', text: 'Found reorder #R-2231, 400 cartons, Warehouse A' },
    { time: '20:06:03', text: 'Drafted WhatsApp to Ahmed, dispatch: “Reorder approved, ships Thu”' },
    { time: '20:06:03', text: 'Awaiting your approval to send', wait: true },
  ],
  cardLabel:
    'A transcript: someone says “Approve the 400 carton reorder and tell Ahmed it ships Thursday.” Echo finds the reorder, drafts the WhatsApp to Ahmed, and waits for approval before sending.',
};

export const privateScreen = {
  headline: 'Nothing leaves your building.',
  body: [
    'Runs on your own servers with local models.',
    'Every decision logged and auditable.',
    'Built for companies that cannot send their data to someone else’s cloud.',
  ],
  models: 'Local models or Claude, your choice.',
  frameLabel: 'YOUR SERVERS',
  // Labels inside the drawing
  scene: { cloud: 'someone else’s cloud', model: 'local model', log: 'audit log' },
  canvasLabel:
    'A building cut open: server racks, a local model and an audit log inside, with data moving between them. Packets that head for someone else’s cloud bounce off the glass and come back.',
};

export const proof = {
  // The headline is set in three parts, each carrying a footnote, because
  // every answer Occuris gives is cited.
  headline: ['Six months.', '300+ items.', 'Two languages.'],
  notes: [
    'Length of the first pilot of Occuris Command.', // DRAFT note
    'Parts tracked for stock, lead time and end-of-life.', // DRAFT note
    'Urdu and English, often in the same message.', // DRAFT note
  ],
  pilot:
    'Our first pilot ran Occuris Command for an import and export business across countries and time zones: stock, lead times, end-of-life parts and supply-risk news, with every answer cited.',
  workHeading: 'Work with us',
  workIntro:
    'The three products are the start. Most clients need them shaped to their own tools, data and rules. We build that, on your infrastructure, with you owning the code.',
  forLabel: 'For',
  offers: [
    {
      title: 'Supply chain and operations',
      body: 'Agents on top of your ERP, your spreadsheets and your WhatsApp groups. Stock, lead times, supplier risk, reorders.',
      who: 'Manufacturers, importers, distributors',
    },
    {
      title: 'Security operations',
      body: 'AI assistants that work with the SIEM you already run: Splunk, QRadar, LogRhythm and others. Threat hunting in plain language, with every query and result logged.',
      who: 'Security firms, integrators, bank IT',
    },
    {
      title: 'Voice and accessibility',
      body: 'Voice-first front ends for your own tools, with approval gates on every action. For staff who cannot type, or whose hands are busy.',
      who: 'Banks, hospitals, NGOs, government',
    },
    {
      title: 'Private AI infrastructure',
      body: 'Local models, tenant isolation, tamper-evident logs and audit trails. For data that cannot leave the building.',
      who: 'Anyone regulated',
    },
  ],
  pilot2: 'Engagements start with a two-week scoped pilot on your data.',
  principles: ['Human in the loop', 'Every action logged', 'Model-agnostic: local, Claude or others', 'You own the code'],
  contactLabels: { email: 'Email', office: 'Office' },
  mailApp: 'or use your mail app',
  reply: 'Reply within one working day.',
  teamHeading: 'Team',
  team: [
    { name: 'Kashaf Fatima', role: 'Founder and Lead AI Engineer', bio: 'AI/ML engineer, previously ProForecast (UK). Built Command and Occuralog.', linkedin: 'https://www.linkedin.com/in/kashaf-fatima-jaffri67' },
    { name: 'Muntaha Jabbar', role: 'Co-founder, AI and QA', bio: 'QA and evaluation. Owns the test suites.', linkedin: 'https://www.linkedin.com/in/muntaha-j-abbasi-52253426a/' },
    { name: 'Rizwan Saleem', role: 'Co-founder, Brand and Engineering', bio: 'Brand and front end. Built this site’s design system.', linkedin: 'https://www.linkedin.com/in/rizwan-saleem-451b18258/' },
  ],
  teamLink: 'LinkedIn',
};

export const footer = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  substack: 'Substack',
  location: 'Karachi, Pakistan',
  copyright: '© 2026 Occuris AI',
  newTab: '(opens in a new tab)',
};

export const fallbackAlt = {
  map: 'An illustrated map of the supply chain from Dubai to Sukkur, with trucks on the roads and a ship at Karachi port.',
  flow: 'Particles lined up into eight rows.',
  building: 'A building cut open to show your servers inside. Data moves between them and never leaves.',
};
