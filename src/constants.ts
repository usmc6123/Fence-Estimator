import { MaterialItem, FenceStyle } from './types';

export const MATERIALS: MaterialItem[] = [
  // Wood Structure
  { id: 'w-post-4x4', name: '4x4-8\' PT Wood Post', category: 'Post', unit: 'each', cost: 14.50, description: 'Pressure-treated pine', imageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=800&auto=format&fit=crop' },
  { id: 'w-post-6x6', name: '6x6-8\' PT Wood Post', category: 'Post', unit: 'each', cost: 32.00, description: 'Heavy duty pressure-treated', imageUrl: 'https://images.unsplash.com/photo-1516455590571-18256e5bb9ff?q=80&w=800&auto=format&fit=crop' },
  { id: 'w-rail-2x4', name: '2x4-8\' PT Wood Rail', category: 'Rail', unit: 'each', cost: 8.75, description: 'Horizontal support', imageUrl: 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=800&auto=format&fit=crop' },
  { id: 'w-picket-1x6', name: '1x6-6\' Cedar Picket', category: 'Picket', unit: 'each', cost: 3.50, description: 'Western Red Cedar', imageUrl: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=800&auto=format&fit=crop' },
  { id: 'w-picket-1x4', name: '1x4-4\' Wood Picket', category: 'Picket', unit: 'each', cost: 2.10, description: 'Standard pine picket', imageUrl: 'https://images.unsplash.com/photo-1505330622279-bf7d7fc918f4?q=80&w=800&auto=format&fit=crop' },
  
  // Vinyl Structure
  { id: 'v-post-5x5', name: '5x5-8\' Vinyl Post', category: 'Post', unit: 'each', cost: 45.00, description: 'Hollow PVC post', imageUrl: 'https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?q=80&w=800&auto=format&fit=crop' },
  { id: 'v-post-4x4', name: '4x4-8\' Vinyl Post', category: 'Post', unit: 'each', cost: 38.00, description: 'Standard PVC post', imageUrl: 'https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?q=80&w=800&auto=format&fit=crop' },
  { id: 'v-insert-steel', name: 'Steel I-Beam Insert', category: 'Hardware', unit: 'each', cost: 55.00, description: 'Gate post reinforcement', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  { id: 'v-panel-tg', name: 'T&G Vinyl Panel Slats', category: 'Panel', unit: 'lf', cost: 12.00, description: 'Tongue & Groove vertical slats', imageUrl: 'https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?q=80&w=800&auto=format&fit=crop' },
  
  // Chain Link Structure
  { id: 'cl-post-term', name: '2-3/8" Terminal Post', category: 'Post', unit: 'each', cost: 28.00, description: 'End/Corner/Gate post', imageUrl: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?q=80&w=800&auto=format&fit=crop' },
  { id: 'cl-post-line', name: '1-5/8" Line Post', category: 'Post', unit: 'each', cost: 18.50, description: 'Intermediate post', imageUrl: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?q=80&w=800&auto=format&fit=crop' },
  { id: 'cl-rail-top', name: '1-3/8" Top Rail', category: 'Rail', unit: 'lf', cost: 2.50, description: 'Horizontal top pipe', imageUrl: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?q=80&w=800&auto=format&fit=crop' },
  { id: 'cl-mesh-galv', name: '9ga Galv Mesh 6\'', category: 'Picket', unit: 'lf', cost: 6.50, description: 'Standard chain link fabric', imageUrl: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?q=80&w=800&auto=format&fit=crop' },
  { id: 'cl-tension-wire', name: 'Bottom Tension Wire', category: 'Hardware', unit: 'lf', cost: 0.45, description: 'Prevents mesh lifting', imageUrl: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?q=80&w=800&auto=format&fit=crop' },
  
  // Metal Structure
  { id: 'm-post-2x2', name: '2x2 Aluminum Post', category: 'Post', unit: 'each', cost: 35.00, description: 'Powder coated black', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  { id: 'm-panel-std', name: '6x8 Aluminum Panel', category: 'Panel', unit: 'each', cost: 185.00, description: 'Pre-welded section', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  
  // Farm Structure
  { id: 'f-post-t', name: '6\' Steel T-Post', category: 'Post', unit: 'each', cost: 7.50, description: 'Agricultural steel post', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  { id: 'f-wire-barbed', name: 'Barbed Wire Roll', category: 'Picket', unit: 'lf', cost: 0.15, description: '4-point barb', imageUrl: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?q=80&w=800&auto=format&fit=crop' },
  
  // Hardware & Fasteners
  { id: 'h-bracket-w', name: 'Wood Fence Bracket', category: 'Hardware', unit: 'each', cost: 1.25, description: 'Simpson Strong-Tie', imageUrl: 'https://images.unsplash.com/photo-1581244276891-99bc4024366c?q=80&w=800&auto=format&fit=crop' },
  { id: 'h-screw-3', name: '3" Exterior Screws', category: 'Fastener', unit: 'box', cost: 24.00, description: '5lb box, deck rated', imageUrl: 'https://images.unsplash.com/photo-1581244276891-99bc4024366c?q=80&w=800&auto=format&fit=crop' },
  { id: 'h-nail-galv', name: 'Galv Ring-Shank Nails', category: 'Fastener', unit: 'box', cost: 35.00, description: '2" nails, 5lb box', imageUrl: 'https://images.unsplash.com/photo-1590674899484-d5640e854abe?q=80&w=800&auto=format&fit=crop' },
  { id: 'h-screw-v', name: 'Vinyl Self-Drilling', category: 'Fastener', unit: 'box', cost: 18.00, description: 'White capped screws', imageUrl: 'https://images.unsplash.com/photo-1581244276891-99bc4024366c?q=80&w=800&auto=format&fit=crop' },
  { id: 'h-cl-band-tens', name: 'Tension Band', category: 'Hardware', unit: 'each', cost: 0.85, description: 'For terminal posts', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  { id: 'h-cl-band-brace', name: 'Brace Band', category: 'Hardware', unit: 'each', cost: 0.95, description: 'For rail ends', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  { id: 'h-cl-tie', name: 'Aluminum Fence Ties', category: 'Hardware', unit: 'box', cost: 12.00, description: '100 count', imageUrl: 'https://images.unsplash.com/photo-1590674899484-d5640e854abe?q=80&w=800&auto=format&fit=crop' },
  
  // Gates
  { id: 'g-kit-wood', name: 'Heavy Duty Gate Kit', category: 'Gate', unit: 'each', cost: 65.00, description: 'Hinges, latch, anti-sag', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  { id: 'g-latch-grav', name: 'Gravity Latch', category: 'Gate', unit: 'each', cost: 22.00, description: 'Pool-safe closure', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  
  // Installation
  { id: 'i-concrete-80', name: '80lb Concrete Mix', category: 'Concrete', unit: 'bag', cost: 6.25, description: 'Standard setting', imageUrl: 'https://images.unsplash.com/photo-1517646288024-aaee0214b06e?q=80&w=800&auto=format&fit=crop' },
  { id: 'i-concrete-fast', name: 'Fast-Set Concrete', category: 'Concrete', unit: 'bag', cost: 8.50, description: 'Quikrete Red Bag', imageUrl: 'https://images.unsplash.com/photo-1517646288024-aaee0214b06e?q=80&w=800&auto=format&fit=crop' },
  { id: 'i-gravel', name: 'Crushed Stone (Gravel)', category: 'Concrete', unit: 'cu yd', cost: 45.00, description: 'For post drainage', imageUrl: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=800&auto=format&fit=crop' },
  { id: 'i-foam', name: 'Post-Setting Foam', category: 'Concrete', unit: 'each', cost: 15.00, description: '2-part expanding foam', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  
  // Demolition
  { id: 'd-labor', name: 'Demo Labor Rate', category: 'Labor', unit: 'hour', cost: 45.00, description: 'Removal and loading', imageUrl: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ecb?q=80&w=800&auto=format&fit=crop' },
  { id: 'd-dumpster', name: 'Dumpster Fee', category: 'Demolition', unit: 'each', cost: 450.00, description: '15-yard roll off', imageUrl: 'https://images.unsplash.com/photo-1591193686104-fddba4d0e4d8?q=80&w=800&auto=format&fit=crop' },
  { id: 'd-hauling', name: 'Hauling Trip', category: 'Demolition', unit: 'trip', cost: 125.00, description: 'Truck trip to dump', imageUrl: 'https://images.unsplash.com/photo-1586191121278-22071efc57aa?q=80&w=800&auto=format&fit=crop' },
  { id: 'd-blade', name: 'Saw Blades (Carbide)', category: 'Consumable', unit: 'each', cost: 12.00, description: 'Reciprocating saw blades', imageUrl: 'https://images.unsplash.com/photo-1530124560676-1adc2742b15d?q=80&w=800&auto=format&fit=crop' },
  { id: 'd-ppe', name: 'Safety Gear Kit', category: 'Consumable', unit: 'each', cost: 15.00, description: 'Gloves, mask, goggles', imageUrl: 'https://images.unsplash.com/photo-1584467735815-f778f274e296?q=80&w=800&auto=format&fit=crop' },
  
  // Site Prep
  { id: 's-marking', name: 'Marking Paint & Stakes', category: 'SitePrep', unit: 'each', cost: 25.00, description: 'Layout supplies', imageUrl: 'https://images.unsplash.com/photo-1592150621344-c90efc3954f3?q=80&w=800&auto=format&fit=crop' },
  { id: 's-clearing', name: 'Vegetation Clearing', category: 'Labor', unit: 'hour', cost: 55.00, description: 'Brush and root removal', imageUrl: 'https://images.unsplash.com/photo-1592150621344-c90efc3954f3?q=80&w=800&auto=format&fit=crop' },
  
  // Finishing
  { id: 'f-stain', name: 'Wood Sealant/Stain', category: 'Finishing', unit: 'gallon', cost: 48.00, description: 'Premium protection', imageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=800&auto=format&fit=crop' },
  { id: 'f-shims', name: 'Leveling Shims', category: 'Consumable', unit: 'box', cost: 8.00, description: 'For rail alignment', imageUrl: 'https://images.unsplash.com/photo-1505330622279-bf7d7fc918f4?q=80&w=800&auto=format&fit=crop' },
  
  // Post Caps
  { id: 'pc-pyramid', name: 'Pyramid Cap', category: 'PostCap', unit: 'each', cost: 4.50, imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  { id: 'pc-gothic', name: 'Gothic Cap', category: 'PostCap', unit: 'each', cost: 6.50, imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
  { id: 'pc-solar', name: 'Solar LED Cap', category: 'PostCap', unit: 'each', cost: 18.00, imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
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
      { id: 'w-std', name: 'Standard Dog-Ear', priceModifier: 0, imageUrl: 'https://images.unsplash.com/photo-1505330622279-bf7d7fc918f4?q=80&w=800&auto=format&fit=crop' },
      { id: 'w-cap', name: 'Cap & Trim', priceModifier: 4.50, imageUrl: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=800&auto=format&fit=crop' },
      { id: 'w-shadow', name: 'Shadowbox', priceModifier: 6.00, imageUrl: 'https://images.unsplash.com/photo-1516455590571-18256e5bb9ff?q=80&w=800&auto=format&fit=crop' },
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
      { id: 'v-bryce', name: 'Bryce (Solid)', priceModifier: 0, imageUrl: 'https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?q=80&w=800&auto=format&fit=crop' },
      { id: 'v-lattice', name: 'Lattice Top', priceModifier: 8.50, imageUrl: 'https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?q=80&w=800&auto=format&fit=crop' },
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
      { id: 'cl-std', name: 'Standard Mesh', priceModifier: 0, imageUrl: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?q=80&w=800&auto=format&fit=crop' },
      { id: 'cl-slat', name: 'Privacy Slats', priceModifier: 12.00, imageUrl: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?q=80&w=800&auto=format&fit=crop' },
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
      { id: 'm-flat', name: 'Flat Top', priceModifier: 0, imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
      { id: 'm-spear', name: 'Spear Top', priceModifier: 5.00, imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop' },
    ],
    calcLogic: { postsPerLF: 0.125, railsPerLF: 0, picketsPerLF: 0, concretePerPost: 1.5 },
    baseLaborRate: 18.00,
  },
];
