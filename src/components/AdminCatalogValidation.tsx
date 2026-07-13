import React from 'react';
import { ShieldCheck, AlertCircle, RefreshCw, CheckCircle2, Search } from 'lucide-react';
import { MaterialItem } from '../types';
import { MATERIALS } from '../constants';

interface AdminCatalogValidationProps {
  materials: MaterialItem[];
}

export default function AdminCatalogValidation({ materials }: AdminCatalogValidationProps) {
  const [results, setResults] = React.useState<{ id: string; status: 'found' | 'missing'; name: string }[]>([]);
  const [isValidating, setIsValidating] = React.useState(false);

  const validateCatalog = () => {
    setIsValidating(true);
    
    // Define the required IDs based on the calculation engine logic
    const heights = [3, 4, 5, 6, 8];
    const finishes = ['', 'black-'];
    const grades = ['res', 'comm'];
    
    const requiredIds: { id: string; name: string }[] = [];
    
    finishes.forEach(finish => {
      const isBlack = finish !== '';
      const finishName = isBlack ? 'Black' : 'Galvanized';
      
      // Posts
      heights.forEach(h => {
        requiredIds.push({ id: `cl-post-line-${finish}${h}`, name: `${finishName} Line Post ${h}'` });
        requiredIds.push({ id: `cl-post-line-${finish}comm-${h}`, name: `${finishName} Commercial Line Post ${h}'` });
        requiredIds.push({ id: `cl-post-line-${finish}res-${h}`, name: `${finishName} Residential Line Post ${h}'` });
        requiredIds.push({ id: `cl-post-term-${finish}${h}`, name: `${finishName} Terminal Post ${h}'` });
      });
      
      // Mesh
      grades.forEach(grade => {
        heights.forEach(h => {
          requiredIds.push({ id: `cl-mesh-${finish}${grade}-${h}`, name: `${finishName} ${grade.toUpperCase()} Mesh ${h}'` });
        });
      });
      
      // Hardware
      requiredIds.push({ id: `cl-hw-dome-${finish}238`, name: `${finishName} 2-3/8" Dome Cap` });
      requiredIds.push({ id: `cl-hw-loop-${finish}158`, name: `${finishName} 1-5/8" Loop Cap` });
      requiredIds.push({ id: `cl-hw-loop-${finish}178`, name: `${finishName} 1-7/8" Loop Cap` });
      
      heights.forEach(h => {
        requiredIds.push({ id: `cl-hw-tension-bar-${finish}${h}`, name: `${finishName} Tension Bar ${h}'` });
      });
      
      requiredIds.push({ id: `cl-hw-tension-band-${finish}238`, name: `${finishName} 2-3/8" Tension Band` });
      requiredIds.push({ id: `cl-hw-brace-band-${finish}238`, name: `${finishName} 2-3/8" Brace Band` });
      
      requiredIds.push({ id: `cl-hw-cup-${finish}comm`, name: `${finishName} 1-5/8" Rail End Cup` });
      requiredIds.push({ id: `cl-hw-cup-${finish}res`, name: `${finishName} 1-3/8" Rail End Cup` });
      
      requiredIds.push({ id: `cl-hw-ez-tie-${finish}138`, name: `${finishName} 1-3/8" EZ Tie` });
      requiredIds.push({ id: `cl-hw-ez-tie-${finish}158`, name: `${finishName} 1-5/8" EZ Tie` });
      requiredIds.push({ id: `cl-hw-ez-tie-${finish}178`, name: `${finishName} 1-7/8" EZ Tie` });
      
      requiredIds.push({ id: `cl-hw-hog-ring${isBlack ? '-black' : ''}`, name: `${finishName} Hog Ring` });
      requiredIds.push({ id: `cl-tension-wire${isBlack ? '-black' : ''}`, name: `${finishName} Tension Wire` });
      requiredIds.push({ id: `cl-hw-boulevard${isBlack ? '-black' : ''}`, name: `${finishName} Boulevard Bracket` });
      
      // Gates
      requiredIds.push({ id: `cl-gate-frame${isBlack ? '-black' : ''}-138`, name: `${finishName} 1-3/8" Gate Frame` });
      requiredIds.push({ id: `cl-gate-elbow${isBlack ? '-black' : ''}-138`, name: `${finishName} 1-3/8" Gate Elbow` });
      requiredIds.push({ id: `cl-gate-hinge-male${isBlack ? '-black' : ''}-238`, name: `${finishName} 2-3/8" Male Hinge` });
      requiredIds.push({ id: `cl-gate-hinge-female${isBlack ? '-black' : ''}-138`, name: `${finishName} 1-3/8" Female Hinge` });
      requiredIds.push({ id: `cl-gate-fork-latch${isBlack ? '-black' : ''}-238`, name: `${finishName} 2-3/8" Fork Latch` });
    });

    const materialIds = new Set(materials.map(m => m.id));
    const validationResults = requiredIds.map(req => ({
      ...req,
      status: materialIds.has(req.id) ? 'found' : 'missing'
    }) as { id: string; status: 'found' | 'missing'; name: string });

    setResults(validationResults);
    setIsValidating(false);
  };

  const missingCount = results.filter(r => r.status === 'missing').length;

  return (
    <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-6">
      <div className="border-b border-[#F0F0F0] pb-4 flex justify-between items-center">
        <div>
          <h3 className="text-sm font-black text-american-blue uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck size={18} />
            Catalog Integrity Audit
          </h3>
          <p className="text-[11px] text-gray-500 font-sans mt-1">
            Verify every chain-link BOM component supported by the calculation engine exists in the library.
          </p>
        </div>
        <button
          onClick={validateCatalog}
          disabled={isValidating}
          className="bg-american-blue text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-opacity-90 transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={isValidating ? 'animate-spin' : ''} />
          {isValidating ? 'Validating...' : 'Run Audit'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">Total Checked</p>
                <p className="text-2xl font-black text-american-blue">{results.length}</p>
              </div>
              <Search className="text-slate-300" size={32} />
            </div>
            <div className={`flex-1 p-4 rounded-2xl border flex items-center justify-between ${missingCount > 0 ? 'bg-american-red/5 border-american-red/10' : 'bg-green-50 border-green-100'}`}>
              <div>
                <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">Missing Items</p>
                <p className={`text-2xl font-black ${missingCount > 0 ? 'text-american-red' : 'text-green-600'}`}>
                  {missingCount}
                </p>
              </div>
              {missingCount > 0 ? <AlertCircle className="text-american-red/30" size={32} /> : <CheckCircle2 className="text-green-600/30" size={32} />}
            </div>
          </div>

          <div className="border border-[#E5E5E5] rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F9F9F9] border-b border-[#E5E5E5]">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Component Name</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">System ID</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {results.map((res) => (
                  <tr key={res.id} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-american-blue">{res.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{res.id}</code>
                    </td>
                    <td className="px-4 py-3">
                      {res.status === 'found' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-wide">
                          <CheckCircle2 size={10} />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-american-red/10 text-american-red text-[10px] font-black uppercase tracking-wide">
                          <AlertCircle size={10} />
                          Missing
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results.length === 0 && !isValidating && (
        <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
            <Search size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-black text-american-blue uppercase tracking-wider">No Audit Performed</p>
            <p className="text-[11px] text-gray-400">Click "Run Audit" to verify the chain-link material library integrity.</p>
          </div>
        </div>
      )}
    </div>
  );
}
