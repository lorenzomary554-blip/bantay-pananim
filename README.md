# 🌾 Bantay Pananim v1.0

**Grain & Produce Storage Batch Expiry Tracker**
*Designed for Filipino Elder Farmers, Senior Coop Leaders, and Warehouse Managers*

---

## 📋 What Is This?

Bantay Pananim is a simple web application that helps you:

- **Track stored crops** (Rice, Corn, Mungbean, etc.) in your storage rooms
- **Know when crops will expire** based on moisture levels
- **Sell oldest crops first** to avoid spoilage (FIFO method)
- **See which storage rooms** have crops and which are empty
- **Record all sales** for bookkeeping

## 🚀 How to Set Up

### Prerequisites

You need **Node.js** (version 18 or newer) installed on your computer.

- Download Node.js: https://nodejs.org/

### Step 1: Open a Terminal

- On Windows: Open **Command Prompt** or **PowerShell**
- On Mac/Linux: Open **Terminal**

### Step 2: Go to the Project Folder

```bash
cd path/to/bantay-pananim
```

### Step 3: Install Required Software

```bash
npm install
```

### Step 4: Start the Application

```bash
npm start
```

You will see:
```
🌾 ═══════════════════════════════════════════════
   Bantay Pananim v1.0 is running!
   Open your browser at: http://localhost:3000
🌾 ═══════════════════════════════════════════════
```

### Step 5: Open Your Browser

Go to: **http://localhost:3000**

That's it! The app comes pre-loaded with sample data so you can try it immediately.

---

## 📱 How to Use

### Dashboard
The main page shows you:
- How many kilograms of crops are stored
- How many batches need to be sold soon
- Which batches are urgent
- A chart showing the overall status

### Storage Rooms
See all your storage rooms in a visual grid. Each room shows:
- What crops are inside
- How full the room is
- A clear status badge (SAFE ✅, SELL SOON ⏰, URGENT ⚠️, EMPTY 📭)

### Register New Harvest
Follow the step-by-step form to record new crops:
1. Choose the crop type
2. Pick a storage room
3. Enter the weight
4. Enter the moisture reading
5. Pick the date received

The system automatically calculates when the crop will expire!

### Sell / Dispatch Crops
When selling crops, the system recommends which batch to sell first (the oldest one). This helps prevent spoilage.

---

## 🗃️ Sample Data Included

The app comes with pre-loaded data:

| Crop | Shelf Life | Max Safe Moisture |
|------|-----------|-------------------|
| Rice (Bigas) | 90 days | 14% |
| Corn (Mais) | 120 days | 13% |
| Mungbean (Monggo) | 180 days | 12% |
| Dried Cassava (Kamoteng Kahoy) | 60 days | 15% |
| Peanuts (Mani) | 150 days | 9% |

Plus 8 storage rooms (Room A1–A4, Room B1–B4) and 6 sample batches.

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express.js |
| Database | SQLite (better-sqlite3) |
| Views | EJS Templates |
| Styling | Tailwind CSS v3 + Custom CSS |
| Charts | Chart.js |
| Fonts | Inter (Google Fonts) |

---

## 📁 Project Structure

```
bantay-pananim/
├── server.js              # Main server
├── database.js            # Database setup & seed data
├── routes/                # Route handlers
│   ├── dashboard.js
│   ├── batches.js
│   ├── bays.js
│   ├── dispatch.js
│   └── api.js
├── views/                 # EJS templates
│   ├── layout.ejs
│   ├── dashboard.ejs
│   ├── storage-grid.ejs
│   ├── batch-form.ejs
│   ├── batch-list.ejs
│   ├── dispatch-form.ejs
│   ├── dispatch-log.ejs
│   └── partials/
├── public/                # Static files
│   ├── css/custom.css
│   └── js/
└── package.json
```

---

## 📄 License

MIT License — Free to use and modify.
