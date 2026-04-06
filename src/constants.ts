import { MaterialItem, FenceStyle } from './types';

export const MATERIALS: MaterialItem[] = [
  // Wood Structure
  { id: 'w-post-4x4', name: '4x4-8\' PT Wood Post', category: 'Post', unit: 'each', cost: 14.50, description: 'Pressure-treated pine' },
  { id: 'w-post-6x6', name: '6x6-8\' PT Wood Post', category: 'Post', unit: 'each', cost: 32.00, description: 'Heavy duty pressure-treated' },
  { id: 'w-rail-2x4', name: '2x4-8\' PT Wood Rail', category: 'Rail', unit: 'each', cost: 8.75, description: 'Horizontal support' },
  { id: 'w-picket-1x6', name: '1x6-6\' Cedar Picket', category: 'Picket', unit: 'each', cost: 3.50, description: 'Western Red Cedar' },
  { id: 'w-picket-1x4', name: '1x4-4\' Wood Picket', category: 'Picket', unit: 'each', cost: 2.10, description: 'Standard pine picket' },
  
  // Vinyl Structure
  { id: 'v-post-5x5', name: '5x5-8\' Vinyl Post', category: 'Post', unit: 'each', cost: 45.00, description: 'Hollow PVC post' },
  { id: 'v-post-4x4', name: '4x4-8\' Vinyl Post', category: 'Post', unit: 'each', cost: 38.00, description: 'Standard PVC post' },
  { id: 'v-insert-steel', name: 'Steel I-Beam Insert', category: 'Hardware', unit: 'each', cost: 55.00, description: 'Gate post reinforcement' },
  { id: 'v-panel-tg', name: 'T&G Vinyl Panel Slats', category: 'Panel', unit: 'lf', cost: 12.00, description: 'Tongue & Groove vertical slats' },
  
  // Chain Link Structure
  { id: 'cl-post-term', name: '2-3/8" Terminal Post', category: 'Post', unit: 'each', cost: 28.00, description: 'End/Corner/Gate post' },
  { id: 'cl-post-line', name: '1-5/8" Line Post', category: 'Post', unit: 'each', cost: 18.50, description: 'Intermediate post' },
  { id: 'cl-rail-top', name: '1-3/8" Top Rail', category: 'Rail', unit: 'lf', cost: 2.50, description: 'Horizontal top pipe' },
  { id: 'cl-mesh-galv', name: '9ga Galv Mesh 6\'', category: 'Picket', unit: 'lf', cost: 6.50, description: 'Standard chain link fabric' },
  { id: 'cl-tension-wire', name: 'Bottom Tension Wire', category: 'Hardware', unit: 'lf', cost: 0.45, description: 'Prevents mesh lifting' },
  
  // Metal Structure
  { id: 'm-post-2x2', name: '2x2 Aluminum Post', category: 'Post', unit: 'each', cost: 35.00, description: 'Powder coated black' },
  { id: 'm-panel-std', name: '6x8 Aluminum Panel', category: 'Panel', unit: 'each', cost: 185.00, description: 'Pre-welded section' },
  
  // Farm Structure
  { id: 'f-post-t', name: '6\' Steel T-Post', category: 'Post', unit: 'each', cost: 7.50, description: 'Agricultural steel post' },
  { id: 'f-wire-barbed', name: 'Barbed Wire Roll', category: 'Picket', unit: 'lf', cost: 0.15, description: '4-point barb' },
  
  // Hardware & Fasteners
  { id: 'h-bracket-w', name: 'Wood Fence Bracket', category: 'Hardware', unit: 'each', cost: 1.25, description: 'Simpson Strong-Tie' },
  { id: 'h-screw-3', name: '3" Exterior Screws', category: 'Fastener', unit: 'box', cost: 24.00, description: '5lb box, deck rated' },
  { id: 'h-nail-galv', name: 'Galv Ring-Shank Nails', category: 'Fastener', unit: 'box', cost: 35.00, description: '2" nails, 5lb box' },
  { id: 'h-screw-v', name: 'Vinyl Self-Drilling', category: 'Fastener', unit: 'box', cost: 18.00, description: 'White capped screws' },
  { id: 'h-cl-band-tens', name: 'Tension Band', category: 'Hardware', unit: 'each', cost: 0.85, description: 'For terminal posts' },
  { id: 'h-cl-band-brace', name: 'Brace Band', category: 'Hardware', unit: 'each', cost: 0.95, description: 'For rail ends' },
  { id: 'h-cl-tie', name: 'Aluminum Fence Ties', category: 'Hardware', unit: 'box', cost: 12.00, description: '100 count' },
  
  // Gates
  { id: 'g-kit-wood', name: 'Heavy Duty Gate Kit', category: 'Gate', unit: 'each', cost: 65.00, description: 'Hinges, latch, anti-sag' },
  { id: 'g-latch-grav', name: 'Gravity Latch', category: 'Gate', unit: 'each', cost: 22.00, description: 'Pool-safe closure' },
  
  // Installation
  { id: 'i-concrete-80', name: '80lb Concrete Mix', category: 'Concrete', unit: 'bag', cost: 6.25, description: 'Standard setting' },
  { id: 'i-concrete-fast', name: 'Fast-Set Concrete', category: 'Concrete', unit: 'bag', cost: 8.50, description: 'Quikrete Red Bag' },
  { id: 'i-gravel', name: 'Crushed Stone (Gravel)', category: 'Concrete', unit: 'cu yd', cost: 45.00, description: 'For post drainage' },
  { id: 'i-foam', name: 'Post-Setting Foam', category: 'Concrete', unit: 'each', cost: 15.00, description: '2-part expanding foam' },
  
  // Demolition
  { id: 'd-labor', name: 'Demo Labor Rate', category: 'Labor', unit: 'hour', cost: 45.00, description: 'Removal and loading' },
  { id: 'd-dumpster', name: 'Dumpster Fee', category: 'Demolition', unit: 'each', cost: 450.00, description: '15-yard roll off' },
  { id: 'd-hauling', name: 'Hauling Trip', category: 'Demolition', unit: 'trip', cost: 125.00, description: 'Truck trip to dump' },
  { id: 'd-blade', name: 'Saw Blades (Carbide)', category: 'Consumable', unit: 'each', cost: 12.00, description: 'Reciprocating saw blades' },
  { id: 'd-ppe', name: 'Safety Gear Kit', category: 'Consumable', unit: 'each', cost: 15.00, description: 'Gloves, mask, goggles' },
  
  // Site Prep
  { id: 's-marking', name: 'Marking Paint & Stakes', category: 'SitePrep', unit: 'each', cost: 25.00, description: 'Layout supplies' },
  { id: 's-clearing', name: 'Vegetation Clearing', category: 'Labor', unit: 'hour', cost: 55.00, description: 'Brush and root removal' },
  
  // Finishing
  { id: 'f-stain', name: 'Wood Sealant/Stain', category: 'Finishing', unit: 'gallon', cost: 48.00, description: 'Premium protection' },
  { id: 'f-shims', name: 'Leveling Shims', category: 'Consumable', unit: 'box', cost: 8.00, description: 'For rail alignment' },
  
  // Post Caps
  { id: 'pc-pyramid', name: 'Pyramid Cap', category: 'PostCap', unit: 'each', cost: 4.50, imageUrl: 'https://picsum.photos/seed/pyramid/200/200' },
  { id: 'pc-gothic', name: 'Gothic Cap', category: 'PostCap', unit: 'each', cost: 6.50, imageUrl: 'https://picsum.photos/seed/gothic/200/200' },
  { id: 'pc-solar', name: 'Solar LED Cap', category: 'PostCap', unit: 'each', cost: 18.00, imageUrl: 'https://picsum.photos/seed/solar/200/200' },
];

export const FENCE_STYLES: FenceStyle[] = [
  {
    id: 'wood-privacy',
    name: 'Wood Privacy',
    type: 'Wood',
    description: 'Classic vertical wood privacy fence with cedar pickets.',
    availableHeights: [4, 6, 8],
    availableWidths: [8],
    availableColors: ['Natural', 'Cedar Stain', 'Dark Walnut'],
    visualStyles: [
      { id: 'w-std', name: 'Standard Dog-Ear', priceModifier: 0, imageUrl: 'https://picsum.photos/seed/dogear/400/300' },
      { id: 'w-cap', name: 'Cap & Trim', priceModifier: 4.50, imageUrl: 'https://picsum.photos/seed/captrim/400/300' },
      { id: 'w-shadow', name: 'Shadowbox', priceModifier: 6.00, imageUrl: 'https://picsum.photos/seed/shadow/400/300' },
    ],
    calcLogic: { postsPerLF: 0.125, railsPerLF: 0.375, picketsPerLF: 2.1, concretePerPost: 1.5 },
    baseLaborRate: 12.00,
  },
  {
    id: 'vinyl-privacy',
    name: 'Vinyl Privacy',
    type: 'Vinyl',
    description: 'Low-maintenance PVC privacy fence with interlocking panels.',
    availableHeights: [4, 6],
    availableWidths: [6, 8],
    availableColors: ['White', 'Tan', 'Gray'],
    visualStyles: [
      { id: 'v-bryce', name: 'Bryce (Solid)', priceModifier: 0, imageUrl: 'https://picsum.photos/seed/vinyl1/400/300' },
      { id: 'v-lattice', name: 'Lattice Top', priceModifier: 8.50, imageUrl: 'https://picsum.photos/seed/vinyl2/400/300' },
    ],
    calcLogic: { postsPerLF: 0.125, railsPerLF: 0.25, picketsPerLF: 0, concretePerPost: 2 },
    baseLaborRate: 15.00,
  },
  {
    id: 'chain-link',
    name: 'Chain Link',
    type: 'Chain Link',
    description: 'Durable and affordable galvanized steel mesh fence.',
    availableHeights: [4, 5, 6],
    availableWidths: [10],
    availableColors: ['Galvanized', 'Black Vinyl', 'Green Vinyl'],
    visualStyles: [
      { id: 'cl-std', name: 'Standard Mesh', priceModifier: 0, imageUrl: 'https://picsum.photos/seed/cl1/400/300' },
      { id: 'cl-slat', name: 'Privacy Slats', priceModifier: 12.00, imageUrl: 'https://picsum.photos/seed/cl2/400/300' },
    ],
    calcLogic: { postsPerLF: 0.1, railsPerLF: 0.1, picketsPerLF: 1, concretePerPost: 1.2 },
    baseLaborRate: 8.00,
  },
  {
    id: 'aluminum-ornamental',
    name: 'Aluminum Ornamental',
    type: 'Metal',
    description: 'Elegant powder-coated aluminum panels for a classic look.',
    availableHeights: [4, 5, 6],
    availableWidths: [6, 8],
    availableColors: ['Black', 'Bronze', 'White'],
    visualStyles: [
      { id: 'm-flat', name: 'Flat Top', priceModifier: 0, imageUrl: 'https://picsum.photos/seed/metal1/400/300' },
      { id: 'm-spear', name: 'Spear Top', priceModifier: 5.00, imageUrl: 'https://picsum.photos/seed/metal2/400/300' },
    ],
    calcLogic: { postsPerLF: 0.125, railsPerLF: 0, picketsPerLF: 0, concretePerPost: 1.5 },
    baseLaborRate: 18.00,
  },
];
