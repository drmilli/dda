import type { Module } from './module.js';
import type { ModuleId } from '../types/index.js';
import { m1OnChain } from './m1-onchain/index.js';
import { m2GitHub } from './m2-github/index.js';
import { m3XHistory } from './m3-xhistory/index.js';
import { m4Kol } from './m4-kol/index.js';
import { m5Product } from './m5-product/index.js';
import { m6Copy } from './m6-copy/index.js';

export const MODULES: Record<ModuleId, Module> = {
  M1: m1OnChain,
  M2: m2GitHub,
  M3: m3XHistory,
  M4: m4Kol,
  M5: m5Product,
  M6: m6Copy,
};

export const ALL_MODULE_IDS = Object.keys(MODULES) as ModuleId[];
