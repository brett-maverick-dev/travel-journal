import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const day = (iso) => new Date(iso + "T00:00:00.000Z");

const TRIPS = [
  {
    name: "Autumn Lines", country: "Japan", visibility: "PUBLIC",
    startDate: "2025-10-08", endDate: "2025-10-19",
    destinations: [
      { name: "Tokyo", lat: 35.6762, lng: 139.7595, arrive: "2025-10-08", depart: "2025-10-12", transport: "Flight", detail: "NH106 · 11h 40m" },
      { name: "Hakone", lat: 35.2324, lng: 139.1069, arrive: "2025-10-12", depart: "2025-10-14", transport: "Train", detail: "Romancecar · 1h 25m" },
      { name: "Kyoto", lat: 35.0116, lng: 135.7681, arrive: "2025-10-14", depart: "2025-10-19", transport: "Train", detail: "Hikari 509 · 2h 10m" }
    ],
    pages: [
      {
        title: "Landing at dusk", date: "2025-10-08", place: "Tokyo",
        weather: "19°C, clear", spend: "¥8,400", steps: "6,210 steps",
        tags: "arrival, Shibuya, jetlag",
        notes: "Landed at Haneda a little after four and was on the Keikyu line before the light went. The hotel in Shibuya smelled of cedar and the window looked straight down onto the crossing, which turned out to be a mistake for sleeping and the right call for everything else.\n\nAte standing up at a counter with six seats. Slept badly, woke at three, watched the crossing empty out.",
        activities: [
          {
            title: "Shibuya crossing at 3am", time: "03:10", place: "Shibuya", tags: "night, photography",
            notes: "Jetlag put me on the pedestrian bridge at three in the morning. The crossing runs its lights for nobody — four full cycles with one taxi and a man walking a bicycle. Worth a page of its own because it is the only time I have seen it still."
          }
        ]
      },
      {
        title: "Kanda, secondhand", date: "2025-10-11", place: "Tokyo",
        weather: "22°C, high cloud", spend: "¥13,900", steps: "18,470 steps",
        tags: "books, walking, coffee",
        notes: "Spent the whole day in Jinbocho going shop to shop. Bought two things I cannot read and one I can. The alley behind the third shop had a coffee stand run out of a window with three stools bolted to the pavement.\n\nDinner was a mistake in the best way: ordered by pointing, got something with the texture of custard and the flavour of the sea.",
        activities: [
          {
            title: "The bookshop with the ladder", time: "14:20", place: "Jinbocho", tags: "books",
            notes: "Four storeys, no lift, a rolling ladder the owner moves with his foot. He found me a 1962 photo book of the Tōkaidō line without being asked what I wanted. Paid ¥4,200 and carried it in both arms for the rest of the day."
          }
        ]
      },
      {
        title: "Down the line", date: "2025-10-14", place: "Kyoto",
        weather: "24°C, humid", spend: "¥21,050", steps: "9,930 steps", tags: "train, Kyoto, arrival",
        notes: "Hikari from Odawara. Fuji showed for about ninety seconds on the right-hand side and the whole carriage turned to look at once, then went back to their phones.\n\nKyoto in the late afternoon is a different register from Tokyo — lower, quieter, the smell of wet stone. Walked the canal until it got dark.",
        activities: []
      }
    ]
  },
  {
    name: "Ring Road, Off Season", country: "Iceland", visibility: "PRIVATE",
    startDate: "2026-02-14", endDate: "2026-02-22",
    destinations: [
      { name: "Reykjavík", lat: 64.1466, lng: -21.9426, arrive: "2026-02-14", depart: "2026-02-16", transport: "Flight", detail: "FI451 · 3h 05m" },
      { name: "Vík í Mýrdal", lat: 63.4187, lng: -19.0060, arrive: "2026-02-16", depart: "2026-02-19", transport: "Rental car", detail: "187 km · 2h 30m" },
      { name: "Höfn", lat: 64.2539, lng: -15.2082, arrive: "2026-02-19", depart: "2026-02-22", transport: "Rental car", detail: "272 km · 3h 20m" }
    ],
    pages: [
      {
        title: "Wind, then more wind", date: "2026-02-16", place: "Vík í Mýrdal",
        weather: "-2°C, gale", spend: "kr 14,200", steps: "4,120 steps", tags: "driving, weather",
        notes: "The rental desk warns you about the doors and they are right about the doors. Drove the south coast into a headwind that made the car feel hollow. Stopped twice because the road disappeared into spray.",
        activities: [
          {
            title: "Reynisfjara in a squall", time: "15:40", place: "Reynisfjara", tags: "coast, weather",
            notes: "Black sand moving sideways. Stood well back from the water because the signs are not decorative. Ten minutes was enough and I would do it again."
          }
        ]
      },
      {
        title: "The lagoon road", date: "2026-02-19", place: "Höfn",
        weather: "-5°C, clear", spend: "kr 9,800", steps: "7,640 steps", tags: "glacier, driving",
        notes: "Clear enough to see the ice from the road. Pulled over four times in twenty kilometres and stopped apologising for it.",
        activities: []
      }
    ]
  },
  {
    name: "Atlantic Edge", country: "Portugal", visibility: "PUBLIC",
    startDate: "2024-05-03", endDate: "2024-05-12",
    destinations: [
      { name: "Lisbon", lat: 38.7223, lng: -9.1393, arrive: "2024-05-03", depart: "2024-05-07", transport: "Flight", detail: "TP1339 · 2h 45m" },
      { name: "Sintra", lat: 38.7982, lng: -9.3877, arrive: "2024-05-07", depart: "2024-05-09", transport: "Train", detail: "Rossio line · 40m" },
      { name: "Porto", lat: 41.1579, lng: -8.6291, arrive: "2024-05-09", depart: "2024-05-12", transport: "Train", detail: "Alfa Pendular · 2h 50m" }
    ],
    pages: [
      {
        title: "Uphill both ways", date: "2024-05-04", place: "Lisbon",
        weather: "23°C, sun", spend: "€46", steps: "21,300 steps", tags: "walking, Alfama",
        notes: "Alfama is not a neighbourhood so much as a staircase with houses attached. Ate three times before two in the afternoon and regret none of it.",
        activities: [
          {
            title: "Tram 28, standing room", time: "11:15", place: "Alfama", tags: "transit",
            notes: "Boarded at Graça going the unfashionable direction and got a seat. The brakes smell like a struck match."
          }
        ]
      }
    ]
  },
  {
    name: "Ice and Granite", country: "Argentina", visibility: "PRIVATE",
    startDate: "2023-11-05", endDate: "2023-11-15",
    destinations: [
      { name: "El Calafate", lat: -50.3379, lng: -72.2648, arrive: "2023-11-05", depart: "2023-11-09", transport: "Flight", detail: "AR1876 · 3h 20m" },
      { name: "El Chaltén", lat: -49.3314, lng: -72.8863, arrive: "2023-11-09", depart: "2023-11-15", transport: "Bus", detail: "Ruta 40 · 3h 10m" }
    ],
    pages: [
      {
        title: "Three hours on Ruta 40", date: "2023-11-09", place: "El Chaltén",
        weather: "9°C, wind", spend: "ARS 42,000", steps: "5,410 steps", tags: "bus, wind",
        notes: "Nothing but steppe and guanacos, then the towers appear all at once and the bus goes quiet.",
        activities: [
          {
            title: "Laguna Capri, before dawn", time: "05:30", place: "Fitz Roy trail", tags: "hiking, sunrise",
            notes: "Left in the dark with a head torch and four other people spread out along the switchbacks. The granite went red for maybe six minutes."
          }
        ]
      }
    ]
  },
  {
    name: "Souks to Surf", country: "Morocco", visibility: "PUBLIC",
    startDate: "2023-03-11", endDate: "2023-03-20",
    destinations: [
      { name: "Marrakech", lat: 31.6295, lng: -7.9811, arrive: "2023-03-11", depart: "2023-03-15", transport: "Flight", detail: "AT811 · 3h 30m" },
      { name: "Aït Benhaddou", lat: 31.0472, lng: -7.1318, arrive: "2023-03-15", depart: "2023-03-17", transport: "Rental car", detail: "Tizi n’Tichka · 3h 45m" },
      { name: "Essaouira", lat: 31.5085, lng: -9.7595, arrive: "2023-03-17", depart: "2023-03-20", transport: "Bus", detail: "CTM · 6h 30m" }
    ],
    pages: [
      {
        title: "Over the pass", date: "2023-03-15", place: "Aït Benhaddou",
        weather: "17°C, hazy", spend: "MAD 640", steps: "9,140 steps", tags: "driving, Atlas",
        notes: "The Tichka pass is two hours of switchbacks and one hour of nerve. Mint tea at the top from a man with a folding table.",
        activities: [
          {
            title: "The ksar at last light", time: "18:50", place: "Aït Benhaddou", tags: "architecture",
            notes: "Crossed the riverbed on sandbags. The whole hill turns the colour of a terracotta pot for about twenty minutes and then it is simply brown again."
          }
        ]
      }
    ]
  },
  {
    name: "Northern Loop", country: "Vietnam", visibility: "PRIVATE",
    startDate: "2026-01-22", endDate: "2026-02-02",
    destinations: [
      { name: "Hanoi", lat: 21.0278, lng: 105.8342, arrive: "2026-01-22", depart: "2026-01-26", transport: "Flight", detail: "VN56 · 12h 05m" },
      { name: "Sa Pa", lat: 22.3364, lng: 103.8438, arrive: "2026-01-26", depart: "2026-01-29", transport: "Train", detail: "Night train · 8h" },
      { name: "Ninh Bình", lat: 20.2506, lng: 105.9745, arrive: "2026-01-29", depart: "2026-02-02", transport: "Bus", detail: "Limousine van · 3h" }
    ],
    pages: [
      {
        title: "Old quarter, first night", date: "2026-01-22", place: "Hanoi",
        weather: "16°C, drizzle", spend: "₫420,000", steps: "7,300 steps", tags: "arrival, street food",
        notes: "Booked but not written yet — the plan is four days in the city, the night train north, then the karst.",
        activities: []
      }
    ]
  }
];

async function main() {
  const email = "demo@trekkster.app";
  await db.user.deleteMany({ where: { email } });
  const user = await db.user.create({
    data: {
      email, handle: "demo", verified: true,
      passwordHash: await bcrypt.hash("travelwell", 10)
    }
  });

  for (const t of TRIPS) {
    const trip = await db.trip.create({
      data: {
        userId: user.id, name: t.name, country: t.country, visibility: t.visibility,
        startDate: day(t.startDate), endDate: day(t.endDate)
      }
    });
    for (let i = 0; i < t.destinations.length; i++) {
      const d = t.destinations[i];
      await db.destination.create({
        data: {
          tripId: trip.id, name: d.name, lat: d.lat, lng: d.lng, position: i,
          arrive: day(d.arrive), depart: day(d.depart), transport: d.transport, detail: d.detail
        }
      });
    }
    for (let i = 0; i < t.pages.length; i++) {
      const p = t.pages[i];
      const dayPage = await db.page.create({
        data: {
          tripId: trip.id, kind: "DAY", position: i, title: p.title, date: day(p.date),
          place: p.place, weather: p.weather, spend: p.spend, steps: p.steps,
          notes: p.notes, tags: p.tags
        }
      });
      for (let j = 0; j < p.activities.length; j++) {
        const a = p.activities[j];
        await db.page.create({
          data: {
            tripId: trip.id, kind: "ACTIVITY", parentId: dayPage.id, position: j,
            title: a.title, date: day(p.date), time: a.time, place: a.place,
            notes: a.notes, tags: a.tags
          }
        });
      }
    }
  }

  const trips = await db.trip.count();
  const pages = await db.page.count();
  console.log("Seeded " + trips + " trips and " + pages + " pages for " + email + " (password: travelwell)");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());
