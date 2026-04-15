import { MaterialItem, FenceStyle, CompanyInfo } from './types';

export const COMPANY_INFO: CompanyInfo = {
  name: 'Lone Star Fence Works',
  logo: 'https://images.squarespace-cdn.com/content/v1/68b74932e2866a1b202275b6/c7fad08c-3a80-4620-9f80-d0ae036895f0/Revised+LOGO.png?format=1500w',
  phone: '(469) 560-6269',
  email: 'BradenS@LoneStarFenceWorks.com',
  website: 'https://www.lonestarfenceworks.com/',
  address: '123 Fencing Way, Austin, TX 78701'
};

export const MATERIALS: MaterialItem[] = [
  // Wood Structure
  { id: 'w-post-4x4', name: '4x4-8\' PT Wood Post', category: 'Post', unit: 'each', cost: 16.75, description: 'Pressure-treated pine', imageUrl: 'https://images.thdstatic.com/productImages/1ba2667d-0dc4-4b85-b047-7a4660cfe8a7/svn/pressure-treated-lumber-194354-64_1000.jpg' },
  { id: 'w-post-6x6', name: '6x6-8\' PT Wood Post', category: 'Post', unit: 'each', cost: 38.50, description: 'Heavy duty pressure-treated', imageUrl: 'https://cdn.menardc.com/main/items/media/99998/ProductMedium/TreatedTimber_1_P_6x6_2.jpg' },
  { id: 'w-rail-2x4', name: '2x4-8\' PT Wood Rail', category: 'Rail', unit: 'each', cost: 9.25, description: 'Horizontal support', imageUrl: 'https://mobileimages.lowes.com/productimages/99ab7dc6-bf36-4121-9665-15b150f372a2/65213111.jpg' },
  { id: 'w-picket-pine', name: '1x6-6\' Pine Picket', category: 'Picket', unit: 'each', cost: 2.85, description: 'Pressure-treated pine', imageUrl: 'https://images.thdstatic.com/productImages/1ba2667d-0dc4-4b85-b047-7a4660cfe8a7/svn/pressure-treated-lumber-194354-64_1000.jpg' },
  { id: 'w-picket-w-cedar', name: '1x6-6\' Western Red Cedar Picket', category: 'Picket', unit: 'each', cost: 4.25, description: 'Premium Western Red Cedar', imageUrl: 'https://patriotfencekc.com/wp-content/gallery/aluminu/4-tall-solid-cedar-privacy-1x6x4.jpeg' },
  { id: 'w-picket-j-cedar', name: '1x6-6\' Japanese Cedar Picket', category: 'Picket', unit: 'each', cost: 3.75, description: 'Japanese Cedar (Sugi)', imageUrl: 'https://m.media-amazon.com/images/I/41b0RJrZRKL.jpg' },
  { id: 'w-picket-1x4', name: '1x4-4\' Wood Picket', category: 'Picket', unit: 'each', cost: 2.45, description: 'Standard pine picket', imageUrl: 'https://m.media-amazon.com/images/I/41b0RJrZRKL.jpg' },
  
  // Vinyl Structure
  { id: 'v-post-5x5', name: '5x5-8\' Vinyl Post', category: 'Post', unit: 'each', cost: 48.00, description: 'Hollow PVC post', imageUrl: 'https://pvcfencedepot.com/wp-content/uploads/2022/06/vinyl-end-post.png' },
  { id: 'v-post-4x4', name: '4x4-8\' Vinyl Post', category: 'Post', unit: 'each', cost: 42.00, description: 'Standard PVC post', imageUrl: 'https://cdn11.bigcommerce.com/s-0f3dd/images/stencil/original/products/682/15692/4x4_post_sleeve__38490.1675952057.png?c=2' },
  { id: 'v-insert-steel', name: 'Steel I-Beam Insert', category: 'Hardware', unit: 'each', cost: 58.00, description: 'Gate post reinforcement', imageUrl: 'https://vinylfencefittings.com/store/media/catalog/product/cache/1/image/9df78eab33525d08d6e5fb8d27136e95/n/w/nw6351-096-1_1.jpg' },
  { id: 'v-panel-tg', name: 'T&G Vinyl Panel Slats', category: 'Panel', unit: 'lf', cost: 14.50, description: 'Tongue & Groove vertical slats', imageUrl: 'https://www.showtechfence.com/uploads/202025227/full-vinyl-privacy-fence49586825681.jpg' },
  
  // Chain Link Structure
  { id: 'cl-post-term', name: '2-3/8" Terminal Post', category: 'Post', unit: 'each', cost: 32.00, description: 'End/Corner/Gate post', imageUrl: 'https://us.evocdn.io/dealer/1459/catalog/product/images/171-5313-5332-1.webp' },
  { id: 'cl-post-line', name: '1-5/8" Line Post', category: 'Post', unit: 'each', cost: 22.50, description: 'Intermediate post', imageUrl: 'https://images.thdstatic.com/productImages/697ae182-412a-4187-b72a-1547bd41ac71/svn/fencer-wire-chain-link-fence-accessories-lbp-10x1f58-64_600.jpg' },
  { id: 'cl-rail-top', name: '1-3/8" Top Rail', category: 'Rail', unit: 'lf', cost: 3.25, description: 'Horizontal top pipe', imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSvhspKHpyyyB9YIYToMXfD01oTeYOHnSnpqA&s' },
  { id: 'cl-mesh-galv', name: '9ga Galv Mesh 6\'', category: 'Picket', unit: 'lf', cost: 7.75, description: 'Standard chain link fabric', imageUrl: 'https://image.made-in-china.com/318f0j00YTqfkIjPqHgb/-mp4.webp' },
  { id: 'cl-tension-wire', name: 'Bottom Tension Wire', category: 'Hardware', unit: 'lf', cost: 0.65, description: 'Prevents mesh lifting', imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS_amSlsfxUJJ0Uvy1zk-95EIbBcJb3FEuDHQ&s' },
  
  // Metal Structure
  { id: 'm-post-2x2', name: '2x2 Wrought Iron Post', category: 'Post', unit: 'each', cost: 38.00, description: 'Powder coated black', imageUrl: 'https://quickshipaluminumfence.com/store/media/catalog/product/cache/1/image/9df78eab33525d08d6e5fb8d27136e95/a/b/abp27b_black-aluminum-blank-post-2in-x-2in-x7ft_02.jpg' },
  { id: 'm-panel-std', name: '6x8 Wrought Iron Panel', category: 'Panel', unit: 'each', cost: 195.00, description: 'Pre-welded section', imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ_KcCIlYvrgCjlATncP9RCW6bgzc6Etl3Baw&s' },
  
  // Farm Structure
  { id: 'f-post-t', name: '6\' Steel T-Post', category: 'Post', unit: 'each', cost: 8.25, description: 'Agricultural steel post', imageUrl: 'https://d2j6dbq0eux0bg.cloudfront.net/images/96378769/4289817609.jpg' },
  { id: 'f-wire-barbed', name: 'Barbed Wire Roll', category: 'Picket', unit: 'lf', cost: 0.22, description: '4-point barb', imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRqzM9pNZc71AOgs4XVvE_cm3wWDMsVyW_iGQ&s' },
  
  // Hardware & Fasteners
  { id: 'h-bracket-w', name: 'Wood Fence Bracket', category: 'Hardware', unit: 'each', cost: 1.45, description: 'Simpson Strong-Tie', imageUrl: 'https://ozcobp.com/wp-content/uploads/2021/09/50110_WAP-OZ-on-Fence_Lifestyle.jpg' },
  { id: 'h-screw-3', name: '3" Exterior Screws', category: 'Fastener', unit: 'box', cost: 28.00, description: '5lb box, deck rated', imageUrl: 'https://m.media-amazon.com/images/I/61ygv314ECL.jpg' },
  { id: 'h-nail-galv', name: 'Galv Ring-Shank Nails', category: 'Fastener', unit: 'box', cost: 12.50, description: '2" nails, 5lb box', imageUrl: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcT3jXZREnFZgyniF8VdaLdhA9sn2VkSBBtvBDCISL30fG7dvZ3RtpeX5XBRadvkVk2asLsqNDqysLTBkhrSfNDoo-rjbbkBiM5u_rS6xL2C_NfAfHRHCQ8QCvlTIcOjsks9mI2x4FdUlQ&usqp=CAc' },
  { id: 'h-screw-v', name: 'Vinyl Self-Drilling', category: 'Fastener', unit: 'box', cost: 22.00, description: 'White capped screws', imageUrl: 'https://mobileimages.lowes.com/productimages/3d9dd19e-b914-49f0-8215-9ad09f9e22c0/61389870.jpg?size=pdhism' },
  { id: 'h-cl-band-tens', name: 'Tension Band', category: 'Hardware', unit: 'each', cost: 1.15, description: 'For terminal posts', imageUrl: 'https://www.thetoolsman.com/cdn/shop/files/Grainger_328521C.jpg?v=1713447124' },
  { id: 'h-cl-band-brace', name: 'Brace Band', category: 'Hardware', unit: 'each', cost: 1.25, description: 'For rail ends', imageUrl: 'https://images.thdstatic.com/productImages/a9846dc8-ac20-42cb-83d5-896a93dc00b6/svn/everbilt-chain-link-fence-accessories-328528eb-64_600.jpg' },
  { id: 'h-cl-tie', name: 'Aluminum Fence Ties', category: 'Hardware', unit: 'box', cost: 14.50, description: '100 count', imageUrl: 'https://fencesupplyinc.com/wp-content/uploads/2023/12/fence-ties-9-ga-aluminum-8-1_2-inch_1.jpg' },
  
  // Gates
  { id: 'g-kit-wood', name: 'Heavy Duty Gate Kit', category: 'Gate', unit: 'each', cost: 72.00, description: 'Hinges, latch, anti-sag', imageUrl: 'https://images.thdstatic.com/productImages/600a0d27-8862-4f49-bb9f-acee28329316/svn/afoxsos-specialty-hardware-59sa05453-64_600.jpg' },
  { id: 'g-kit-shark', name: 'Metal Frame Shark Hinge Gate Kit', category: 'Gate', unit: 'each', cost: 145.00, description: 'Heavy duty double gate kit', imageUrl: 'https://images.thdstatic.com/productImages/600a0d27-8862-4f49-bb9f-acee28329316/svn/afoxsos-specialty-hardware-59sa05453-64_600.jpg' },
  { id: 'g-latch-grav', name: 'Gravity Latch', category: 'Gate', unit: 'each', cost: 26.50, description: 'Pool-safe closure', imageUrl: 'https://static.grainger.com/rp/s/is/image/Grainger/1XMP1_AS01?$adapimg$&hei=536&wid=536' },
  
  // Installation
  { id: 'i-concrete-80', name: '80lb Concrete Mix', category: 'Concrete', unit: 'bag', cost: 6.75, description: 'Standard setting', imageUrl: 'https://mobileimages.lowes.com/productimages/abbf972d-3b5f-47fb-94b2-2b7c4797cdaf/64515057.png?size=pdhism' },
  { id: 'i-concrete-fast', name: 'Fast-Set Concrete', category: 'Concrete', unit: 'bag', cost: 9.25, description: 'Quikrete Red Bag', imageUrl: 'https://www.quikrete.com/images/products/fast-setting-concrete.png' },
  { id: 'i-gravel', name: 'Crushed Stone', category: 'Concrete', unit: 'cu yd', cost: 48.00, description: 'For post drainage', imageUrl: 'https://vanputte.com/wp-content/uploads/2021/06/Washed-1-Crushed-Bulk-Stone-1000x1000-2.jpg' },
  { id: 'i-foam', name: 'Post-Setting Foam', category: 'Concrete', unit: 'each', cost: 18.50, description: '2-part expanding foam', imageUrl: 'https://images.thdstatic.com/productImages/bc70eb23-9f73-4ce7-95b4-b048b422ee33/svn/sika-deck-parts-accessories-7116170-c3_600.jpg' },
  
  // Demolition
  { id: 'd-labor', name: 'Demo Labor Rate', category: 'Labor', unit: 'hour', cost: 48.00, description: 'Removal and loading', imageUrl: 'https://junkrelief.com/wp-content/uploads/2022/04/fence-removal-services-chicago.jpg.webp' },
  { id: 'd-dumpster', name: 'Dumpster Fee', category: 'Demolition', unit: 'each', cost: 485.00, description: '15-yard roll off', imageUrl: 'https://www.dumpsters.com/images/hero-demolition-dumpster-940x532.jpg' },
  { id: 'd-hauling', name: 'Hauling Trip', category: 'Demolition', unit: 'trip', cost: 145.00, description: 'Truck trip to dump', imageUrl: 'https://cdn.prod.website-files.com/6697cd1e9427d86c4184a368/66c52265716d7c2c334be6b8_image%2040%20(1).png' },
  { id: 'd-blade', name: 'Saw Blades (Carbide)', category: 'Consumable', unit: 'each', cost: 14.00, description: 'Reciprocating saw blades', imageUrl: 'https://images.thdstatic.com/productImages/05cd7e21-71a0-4234-8e39-1b34ba41bc85/svn/rockwell-circular-saw-blades-rw9281-64_1000.jpg' },
  { id: 'd-ppe', name: 'Safety Gear Kit', category: 'Consumable', unit: 'each', cost: 18.00, description: 'Gloves, mask, goggles', imageUrl: 'https://static.grainger.com/rp/s/is/image/Grainger/TC-FENCE-orange-example1_7133__EDR3_v1?$adapimg$&hei=536&wid=536' },
  
  // Site Prep
  { id: 's-marking', name: 'Marking Paint & Stakes', category: 'SitePrep', unit: 'each', cost: 28.00, description: 'Layout supplies', imageUrl: 'https://www.gmesupply.com/media/catalog/product/m/a/marking-paint-web.jpg' },
  { id: 's-clearing', name: 'Vegetation Clearing', category: 'Labor', unit: 'hour', cost: 58.00, description: 'Brush and root removal', imageUrl: 'https://wemulch.com/wp-content/uploads/2022/09/fence_line_clearing_rocky_road_excavation.webp' },
  
  // Finishing
  { id: 'f-stain', name: 'Wood Sealant/Stain', category: 'Finishing', unit: 'gallon', cost: 52.00, description: 'Premium protection', imageUrl: 'https://m.media-amazon.com/images/I/91JiDMXNQfL._AC_UF350,350_QL80_.jpg' },
  { id: 'f-pre-stain', name: 'Factory Pre-Staining Service', category: 'Finishing', unit: 'lf', cost: 4.50, description: 'Factory applied finish per LF', imageUrl: 'https://m.media-amazon.com/images/I/91JiDMXNQfL._AC_UF350,350_QL80_.jpg' },
  { id: 'f-shims', name: 'Leveling Shims', category: 'Consumable', unit: 'box', cost: 9.50, description: 'For rail alignment', imageUrl: 'https://i.ebayimg.com/images/g/SAcAAOSwTc5b6aQR/s-l1200.jpg' },
  
  // Post Caps
  { id: 'pc-pyramid', name: 'Pyramid Cap', category: 'PostCap', unit: 'each', cost: 5.25, imageUrl: 'https://images.thdstatic.com/productImages/4bcc407b-7ae0-4300-8024-540e19b184a0/svn/redwood-stained-deck-post-caps-483969-64_600.jpg' },
  { id: 'pc-gothic', name: 'Gothic Cap', category: 'PostCap', unit: 'each', cost: 7.25, imageUrl: 'https://i5.walmartimages.com/seo/Universal-Forest-Products-106515-Gothic-Post-Top_430dfd8e-82a1-46c2-995e-13a418bab791.a479575ff19a8db23738c5346e194433.jpeg?odnHeight=2000&odnWidth=2000&odnBg=FFFFFF' },
  { id: 'pc-solar', name: 'Solar LED Cap', category: 'PostCap', unit: 'each', cost: 22.00, imageUrl: 'https://s.turbifycdn.com/aah/yhst-99239380869547/classy-caps-kingsbridge-white-dual-lighted-solar-post-cap-442.png' },
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
      { id: 'w-std', name: "1x6-6' Cedar Dog-Ear Picket", priceModifier: 0, imageUrl: 'https://patriotfencekc.com/wp-content/gallery/aluminu/4-tall-solid-cedar-privacy-1x6x4.jpeg' },
      { id: 'w-cap', name: 'Cap & Trim', priceModifier: 5.50, imageUrl: 'https://cedarcreekfences.com/wp-content/uploads/2020/01/11-Boxed-Posts-1024x768.jpg' },
      { id: 'w-shadow', name: 'Shadowbox', priceModifier: 7.50, imageUrl: 'https://atlantadecking.com/wp-content/uploads/2024/05/wood-fence-min-1024x680-1.jpg' },
    ],
    calcLogic: { postsPerLF: 0.125, railsPerLF: 0.375, picketsPerLF: 2.1, concretePerPost: 1.5 },
    baseLaborRate: 14.50,
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
      { id: 'cl-std', name: "9ga Galv Mesh 6'", priceModifier: 0, imageUrl: 'https://image.made-in-china.com/318f0j00YTqfkIjPqHgb/-mp4.webp' },
      { id: 'cl-slat', name: 'Privacy Slats', priceModifier: 14.00, imageUrl: 'https://www.hooverfence.com/mas_assets/cache/image/1/0/a/0/x600-68106.Jpg' },
    ],
    calcLogic: { postsPerLF: 0.1, railsPerLF: 0.1, picketsPerLF: 1, concretePerPost: 1.2 },
    baseLaborRate: 9.50,
  },
  {
    id: 'aluminum-ornamental',
    name: 'Wrought Iron',
    type: 'Metal',
    description: 'Elegant wrought iron panels for a classic, durable look.',
    availableHeights: [4, 5, 6],
    availableWidths: [6, 8],
    availableColors: ['Black', 'Bronze', 'White'],
    visualStyles: [
      { id: 'm-flat', name: '6x8 Wrought Iron Panel', priceModifier: 0, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ_KcCIlYvrgCjlATncP9RCW6bgzc6Etl3Baw&s' },
      { id: 'm-spear', name: 'Spear Top', priceModifier: 6.50, imageUrl: 'https://cdn.gorilladash.com/images/media/4706798/citywide-macedon-group-spear-top-fencing-original-605a8ba05e349.jpg' },
    ],
    calcLogic: { postsPerLF: 0.125, railsPerLF: 0, picketsPerLF: 0, concretePerPost: 1.5 },
    baseLaborRate: 19.50,
  },
];
