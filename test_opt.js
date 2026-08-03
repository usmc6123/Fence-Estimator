
function calculateStickOptimization(requiredLengths, stickLength) {
  if (requiredLengths.length === 0) {
    return { stickLength, sticks: [], totalWaste: 0, efficiency: 100 };
  }

  const sortedLengths = [...requiredLengths].sort((a, b) => b - a);
  const sticks = [];

  sortedLengths.forEach(length => {
    let placed = false;
    for (const stick of sticks) {
      if (stick.leftover >= length) {
        stick.cuts.push(length);
        stick.leftover -= length;
        placed = true;
        break;
      }
    }

    if (!placed) {
      sticks.push({
        id: sticks.length + 1,
        cuts: [length],
        leftover: stickLength - length
      });
    }
  });

  const totalWaste = sticks.reduce((sum, s) => sum + s.leftover, 0);
  const totalLengthUsed = sticks.length * stickLength;
  const efficiency = totalLengthUsed > 0 ? ((totalLengthUsed - totalWaste) / totalLengthUsed) * 100 : 100;

  return { stickLength, sticks, totalWaste, efficiency };
}

const rail = [32, 32, 32, 32, 22];
const posts8 = Array(17).fill(8);
const posts7 = Array(3).fill(7);
const all = [...rail, ...posts8, ...posts7];

const result = calculateStickOptimization(all, 32);
console.log("Sticks:", result.sticks.length);
result.sticks.forEach(s => console.log(`Stick ${s.id}:`, s.cuts, "Leftover:", s.leftover));
