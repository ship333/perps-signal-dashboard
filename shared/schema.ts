import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, real, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pairA: text("pair_a").notNull(),
  pairB: text("pair_b").notNull(),
  hedgeRatio: real("hedge_ratio").notNull(),
  zScore: real("z_score").notNull(),
  confidence: real("confidence").notNull(),
  expectedEdge: real("expected_edge").notNull(),
  signalType: text("signal_type").notNull(), // LONG_SPREAD or SHORT_SPREAD
  fees: real("fees").default(0),
  funding: real("funding").default(0),
  slippage: real("slippage").default(0),
  netEdge: real("net_edge").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const prices = pgTable("prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  price: real("price").notNull(),
  change24h: real("change_24h").default(0),
  source: text("source").notNull(), // hyperliquid, alchemy
  timestamp: timestamp("timestamp").defaultNow(),
});

export const systemStatus = pgTable("system_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull(),
  dataFreshness: integer("data_freshness"), // seconds since last update
  activePairs: integer("active_pairs").default(0),
  websocketConnections: integer("websocket_connections").default(0),
  uptime: text("uptime").notNull(),
  providers: jsonb("providers"), // {hyperliquid: boolean, alchemy: boolean}
  performance: jsonb("performance"), // various performance metrics
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  createdAt: true,
});

export const insertPriceSchema = createInsertSchema(prices).omit({
  id: true,
  timestamp: true,
});

export const insertSystemStatusSchema = createInsertSchema(systemStatus).omit({
  id: true,
  timestamp: true,
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Price = typeof prices.$inferSelect;
export type InsertPrice = z.infer<typeof insertPriceSchema>;
export type SystemStatus = typeof systemStatus.$inferSelect;
export type InsertSystemStatus = z.infer<typeof insertSystemStatusSchema>;

// WebSocket message types
export const wsMessageSchema = z.object({
  type: z.enum(['signal_update', 'price_update', 'system_update', 'system_status', 'initial_data', 'ping', 'pong']),
  data: z.any().optional(),
  timestamp: z.string().optional(),
});

export type WSMessage = z.infer<typeof wsMessageSchema>;

// API response types
export const bestSignalResponseSchema = z.object({
  asOf: z.string(),
  pair: z.object({
    a: z.string(),
    b: z.string(),
  }),
  sides: z.object({
    a: z.enum(['LONG', 'SHORT']),
    b: z.enum(['LONG', 'SHORT']),
  }),
  metrics: z.object({
    zScore: z.number(),
    hedgeRatio: z.number(),
    confidence: z.number(),
    edgeBps: z.number(),
    pctChange24h: z.number(),
    pctChange6h: z.number(),
    pctChange1h: z.number(),
  }),
  charts: z.object({
    a: z.array(z.object({
      t: z.string(),
      p: z.number(),
    })),
    b: z.array(z.object({
      t: z.string(),
      p: z.number(),
    })),
  }),
  quoteMeta: z.object({
    a: z.object({
      source: z.string().nullable(),
      ageMs: z.number().nullable(),
    }),
    b: z.object({
      source: z.string().nullable(),
      ageMs: z.number().nullable(),
    }),
  }),
});

export type BestSignalResponse = z.infer<typeof bestSignalResponseSchema>;
