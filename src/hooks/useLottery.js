import { useAppData } from '../contexts/AppDataContext';

export const useLottery = () => {
  const { data } = useAppData();

  const performLottery = () => {
    const { lotteryPrizes, lotteryProbability } = data;
    const hasAnyPrize = ['UR', 'SSR', 'SR', 'R', 'N'].some(r => lotteryPrizes[r] && lotteryPrizes[r].length > 0);
    if (!hasAnyPrize) return null;
    
    const rand = Math.random() * 100;
    let rarity;
    if (rand < lotteryProbability.UR) rarity = 'UR';
    else if (rand < lotteryProbability.UR + lotteryProbability.SSR) rarity = 'SSR';
    else if (rand < lotteryProbability.UR + lotteryProbability.SSR + lotteryProbability.SR) rarity = 'SR';
    else if (rand < lotteryProbability.UR + lotteryProbability.SSR + lotteryProbability.SR + lotteryProbability.R) rarity = 'R';
    else rarity = 'N';

    let prizes = lotteryPrizes[rarity];
    if (!prizes || prizes.length === 0) {
      const rarities = ['UR', 'SSR', 'SR', 'R', 'N'];
      const currentIdx = rarities.indexOf(rarity);
      for (let i = currentIdx + 1; i < rarities.length; i++) {
        if (lotteryPrizes[rarities[i]].length > 0) {
          rarity = rarities[i];
          prizes = lotteryPrizes[rarity];
          break;
        }
      }
      if (!prizes || prizes.length === 0) return null;
    }
    
    const selectedPrize = prizes[Math.floor(Math.random() * prizes.length)];
    if (selectedPrize.type === 'image-pool' && selectedPrize.content.length > 0) {
      const randomImagePath = selectedPrize.content[Math.floor(Math.random() * selectedPrize.content.length)];
      return { rarity, prize: { type: 'image', content: randomImagePath } };
    }
    return { rarity, prize: selectedPrize };
  };

  const performLotteryForRarity = (rarity) => {
    const prizes = data.lotteryPrizes[rarity];
    if (!prizes || prizes.length === 0) return null;
    
    const selectedPrize = prizes[Math.floor(Math.random() * prizes.length)];
    if (selectedPrize.type === 'image-pool' && selectedPrize.content.length > 0) {
      const randomImagePath = selectedPrize.content[Math.floor(Math.random() * selectedPrize.content.length)];
      return { rarity, prize: { type: 'image', content: randomImagePath } };
    }
    return { rarity, prize: selectedPrize };
  };

  return { performLottery, performLotteryForRarity };
};