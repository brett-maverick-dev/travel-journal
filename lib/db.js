import { PrismaClient } from "@prisma/client";

// MySQL won't give a TEXT column a default value, so these fields have none
// in the schema; fill them in here so every create gets "" as before.
const TEXT_DEFAULTS = {
  user: { bio: "" },
  page: { notes: "", tags: "" },
  photo: { caption: "" },
  comment: { body: "" }
};

function withTextDefaults(client) {
  const query = {};
  for (const [model, defaults] of Object.entries(TEXT_DEFAULTS)) {
    query[model] = {
      create({ args, query }) {
        return query({ ...args, data: { ...defaults, ...args.data } });
      },
      createMany({ args, query }) {
        const rows = Array.isArray(args.data) ? args.data : [args.data];
        return query({ ...args, data: rows.map((row) => ({ ...defaults, ...row })) });
      }
    };
  }
  return client.$extends({ query });
}

const g = globalThis;
export const db = g.__prisma || withTextDefaults(new PrismaClient());
if (process.env.NODE_ENV !== "production") g.__prisma = db;
