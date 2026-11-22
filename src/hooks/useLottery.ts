import { useAppData } from '../contexts/useAppData.ts';
import { drawPrize, drawFromRarity } from '../domain/lottery.ts';
import type { Rarity } from '../types/data.ts';

export const useLottery = () => {
  const { data } = useAppData();

  // 抽一次；整個獎池都沒有可用獎品時回傳 null
  const performLottery = () => drawPrize(data.lotteryPrizes, data.lotteryProbability);

  // 從指定稀有度抽一次；該稀有度沒有可用獎品時回傳 null
  const performLotteryForRarity = (rarity: Rarity) => drawFromRarity(data.lotteryPrizes, rarity);

  return { performLottery, performLotteryForRarity };
};
