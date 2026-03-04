import React from 'react';
import {
  Heart, BookOpen, Smile, LayoutDashboard, Cloud, Sparkles, Sun, Zap
} from 'lucide-react';

export const RARITY_STYLES = {
  N: {
    color: 'text-slate-500',
    bg: 'bg-slate-500',
    border: 'border-slate-200',
    gradient: 'from-slate-400 to-slate-600',
    shadow: 'shadow-slate-400/10',
    lightBg: 'bg-slate-100',
    icon: <LayoutDashboard className="w-4 h-4" />,
    glow: 'bg-slate-400/30'
  },
  R: {
    color: 'text-sky-500',
    bg: 'bg-sky-500',
    border: 'border-sky-300',
    gradient: 'from-sky-400 to-blue-600',
    shadow: 'shadow-sky-400/20',
    lightBg: 'bg-sky-50',
    icon: <Cloud className="w-4 h-4" />,
    glow: 'bg-sky-400/40'
  },
  SR: {
    color: 'text-purple-500',
    bg: 'bg-purple-500',
    border: 'border-purple-300',
    gradient: 'from-purple-400 to-fuchsia-600',
    shadow: 'shadow-purple-400/20',
    lightBg: 'bg-purple-50',
    icon: <Sparkles className="w-4 h-4" />,
    glow: 'bg-purple-400/50'
  },
  SSR: {
    color: 'text-amber-500',
    bg: 'bg-amber-500',
    border: 'border-amber-300',
    gradient: 'from-amber-400 to-orange-500',
    shadow: 'shadow-amber-400/30',
    lightBg: 'bg-amber-50',
    icon: <Sun className="w-4 h-4" />,
    glow: 'bg-amber-400/60'
  },
  UR: {
    color: 'text-rose-500',
    bg: 'bg-rose-500',
    border: 'border-rose-300',
    gradient: 'from-rose-400 to-red-600',
    shadow: 'shadow-rose-500/30',
    lightBg: 'bg-rose-50',
    icon: <Zap className="w-4 h-4" />,
    glow: 'bg-rose-500/70'
  }
};

export const INDICATORS = [
  { id: 'learning', name: '學習', icon: <BookOpen className="w-5 h-5" />, color: 'from-blue-400 to-indigo-400' },
  { id: 'health', name: '健康', icon: <Heart className="w-5 h-5" />, color: 'from-cyan-400 to-teal-400' },
  { id: 'happiness', name: '幸福', icon: <Smile className="w-5 h-5" />, color: 'from-amber-300 to-orange-400' }
];

export const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const ITEMS_PER_PAGE = 10;