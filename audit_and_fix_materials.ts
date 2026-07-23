import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';

// Initialize the Firebase Admin SDK
if (admin.apps.length === 0) {
  const firebaseConfigEnv = process.env.FIREBASE_CONFIG;
  if (firebaseConfigEnv) {
    try {
      const parsedConfig = JSON.parse(firebaseConfigEnv);
      if (parsedConfig.private_key || parsedConfig.client_email) {
        admin.initializeApp({
          credential: admin.credential.cert(parsedConfig),
        });
      } else {
        admin.initializeApp({
          projectId: parsedConfig.projectId || 'dazzling-card-485210-r8',
        });
      }
    } catch (error) {
      admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
    }
  } else {
    admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
  }
}

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

async function runAuditAndFix() {
  console.log('--- Starting Chain-Link Material Audit & Fix ---');
  
  const heights = [3, 4, 5, 6, 8];
  const finishes = ['', 'black-'];
  const grades = ['res', 'comm'];
  
  const requiredSpecs: { id: string; name: string; category: string; finish: string; height?: number; grade?: string; diameter?: string }[] = [];
  
  finishes.forEach(finish => {
    const isBlack = finish !== '';
    const finishName = isBlack ? 'Black' : 'Galvanized';
    const finishValue = isBlack ? 'black' : 'galvanized';
    
    // Posts
    heights.forEach(h => {
      const postHeight = h + 2;
      // Line Posts
      requiredSpecs.push({ 
        id: `cl-post-line-${finish}res-${postHeight}`, 
        name: `${finishName} Residential Line Post ${postHeight}'`,
        category: 'Post',
        finish: finishValue,
        height: postHeight,
        grade: 'Residential',
        diameter: '1-5/8"'
      });
      requiredSpecs.push({ 
        id: `cl-post-line-${finish}comm-${postHeight}`, 
        name: `${finishName} Commercial Line Post ${postHeight}'`,
        category: 'Post',
        finish: finishValue,
        height: postHeight,
        grade: 'Commercial',
        diameter: '1-7/8"'
      });
      // Terminal Posts
      requiredSpecs.push({ 
        id: `cl-post-term-${finish}${postHeight}`, 
        name: `${finishName} Terminal Post ${postHeight}'`,
        category: 'Post',
        finish: finishValue,
        height: postHeight,
        diameter: '2-3/8"'
      });
    });
    
    // Mesh
    grades.forEach(grade => {
      heights.forEach(h => {
        requiredSpecs.push({ 
          id: `cl-mesh-${finish}${grade}-${h}`, 
          name: `${finishName} ${grade === 'comm' ? '9ga' : '11ga'} Mesh ${h}'`,
          category: 'Picket',
          finish: finishValue,
          height: h,
          grade: grade === 'comm' ? 'Commercial' : 'Residential'
        });
      });
    });
    
    // Hardware
    requiredSpecs.push({ id: `cl-hw-dome-${finish}238`, name: `${finishName} 2-3/8" Dome Cap`, category: 'Hardware', finish: finishValue, diameter: '2-3/8"' });
    requiredSpecs.push({ id: `cl-hw-loop-${finish}158`, name: `${finishName} 1-5/8" Loop Cap`, category: 'Hardware', finish: finishValue, diameter: '1-5/8"' });
    requiredSpecs.push({ id: `cl-hw-loop-${finish}178`, name: `${finishName} 1-7/8" Loop Cap`, category: 'Hardware', finish: finishValue, diameter: '1-7/8"' });
    
    heights.forEach(h => {
      requiredSpecs.push({ id: `cl-hw-tension-bar-${finish}${h}`, name: `${finishName} ${h}' Tension Bar`, category: 'Hardware', finish: finishValue, height: h });
    });
    
    requiredSpecs.push({ id: `cl-hw-tension-band-${finish}238`, name: `${finishName} 2-3/8" Tension Band`, category: 'Hardware', finish: finishValue, diameter: '2-3/8"' });
    requiredSpecs.push({ id: `cl-hw-brace-band-${finish}238`, name: `${finishName} 2-3/8" Brace Band`, category: 'Hardware', finish: finishValue, diameter: '2-3/8"' });
    
    requiredSpecs.push({ id: `cl-hw-cup-${finish}comm`, name: `${finishName} 1-5/8" Rail End Cup`, category: 'Hardware', finish: finishValue, diameter: '1-5/8"' });
    requiredSpecs.push({ id: `cl-hw-cup-${finish}res`, name: `${finishName} 1-3/8" Rail End Cup`, category: 'Hardware', finish: finishValue, diameter: '1-3/8"' });
    
    requiredSpecs.push({ id: `cl-hw-ez-tie-${finish}138`, name: `${finishName} 1-3/8" EZ Tie`, category: 'Hardware', finish: finishValue, diameter: '1-3/8"' });
    requiredSpecs.push({ id: `cl-hw-ez-tie-${finish}158`, name: `${finishName} 1-5/8" EZ Tie`, category: 'Hardware', finish: finishValue, diameter: '1-5/8"' });
    requiredSpecs.push({ id: `cl-hw-ez-tie-${finish}178`, name: `${finishName} 1-7/8" EZ Tie`, category: 'Hardware', finish: finishValue, diameter: '1-7/8"' });
    
    requiredSpecs.push({ id: `cl-hw-hog-ring${isBlack ? '-black' : ''}`, name: `${finishName} Hog Ring`, category: 'Hardware', finish: finishValue });
    requiredSpecs.push({ id: `cl-tension-wire${isBlack ? '-black' : ''}`, name: `${finishName} Tension Wire`, category: 'Hardware', finish: finishValue });
    requiredSpecs.push({ id: `cl-hw-boulevard${isBlack ? '-black' : ''}`, name: `${finishName} Boulevard Bracket`, category: 'Hardware', finish: finishValue });

    // Rail
    requiredSpecs.push({ id: `cl-rail-top-${finish}comm`, name: `${finishName} Commercial Top Rail`, category: 'Structure', finish: finishValue });
    requiredSpecs.push({ id: `cl-rail-top-${finish === '' ? '' : 'black'}`, name: `${finishName} Residential Top Rail`, category: 'Structure', finish: finishValue });
    requiredSpecs.push({ id: `cl-rail-bottom-${finish === '' ? '' : 'black'}`, name: `${finishName} Bottom Rail`, category: 'Structure', finish: finishValue });
    
    // Gates
    requiredSpecs.push({ id: `cl-gate-frame${isBlack ? '-black' : ''}-138`, name: `${finishName} 1-3/8" Gate Frame`, category: 'Gate', finish: finishValue });
    requiredSpecs.push({ id: `cl-gate-elbow${isBlack ? '-black' : ''}-138`, name: `${finishName} 1-3/8" Gate Elbow`, category: 'Gate', finish: finishValue });
    requiredSpecs.push({ id: `cl-gate-hinge-male${isBlack ? '-black' : ''}-238`, name: `${finishName} 2-3/8" Male Hinge`, category: 'Gate', finish: finishValue });
    requiredSpecs.push({ id: `cl-gate-hinge-female${isBlack ? '-black' : ''}-138`, name: `${finishName} 1-3/8" Female Hinge`, category: 'Gate', finish: finishValue });
    requiredSpecs.push({ id: `cl-gate-fork-latch${isBlack ? '-black' : ''}-238`, name: `${finishName} 2-3/8" Fork Latch`, category: 'Gate', finish: finishValue });
  });

  const materialsSnap = await db.collection('materials').get();
  const existingMaterials = new Map();
  materialsSnap.forEach(doc => {
    existingMaterials.set(doc.id, doc.data());
  });

  console.log(`Auditing ${requiredSpecs.length} required material keys...`);

  let createdCount = 0;
  let missingBlack = 0;
  let missingGalv = 0;
  const needsPricing = [];

  const batch = db.batch();

  for (const spec of requiredSpecs) {
    if (!existingMaterials.has(spec.id)) {
      if (spec.finish === 'black') missingBlack++;
      else missingGalv++;

      console.log(`[MISSING] ${spec.id} (${spec.name})`);

      // Try to find galvanized equivalent to clone
      const galvId = spec.id.replace('-black-', '-').replace('-black', '');
      const galvMat = existingMaterials.get(galvId);

      const now = new Date().toISOString();
      const newMat: any = {
        id: spec.id,
        name: spec.name,
        category: spec.category,
        unit: galvMat?.unit || 'each',
        cost: 0,
        finish: spec.finish,
        companyId: 'lonestarfence',
        createdAt: now,
        updatedAt: now,
        pricingStatus: 'Needs Pricing',
        priceSource: 'Not Yet Priced'
      };

      if (spec.height) newMat.height = spec.height;
      if (spec.grade) newMat.grade = spec.grade;
      if (spec.diameter) newMat.diameter = spec.diameter;
      
      // Copy attributes from galvanized equivalent if available
      if (galvMat) {
        newMat.unit = galvMat.unit;
        if (galvMat.packageQuantity) newMat.packageQuantity = galvMat.packageQuantity;
        // Do not copy cost, user said keep at 0 if no verified price
      }

      batch.set(db.collection('materials').doc(spec.id), newMat);
      createdCount++;
      needsPricing.push(spec.id);
    } else {
      const mat = existingMaterials.get(spec.id);
      if (mat.cost === 0) {
        needsPricing.push(spec.id);
      }
    }
  }

  if (createdCount > 0) {
    await batch.commit();
    console.log(`Successfully created ${createdCount} missing material records.`);
  } else {
    console.log('No missing records found to create.');
  }

  console.log('--- Audit Summary ---');
  console.log(`Total Audited: ${requiredSpecs.length}`);
  console.log(`Missing Black: ${missingBlack}`);
  console.log(`Missing Galvanized: ${missingGalv}`);
  console.log(`Records Created: ${createdCount}`);
  console.log(`Total Needing Pricing: ${needsPricing.length}`);
  console.log('--- Audit Complete ---');
}

runAuditAndFix().catch(console.error);
