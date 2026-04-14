# How to Run Expert Advisor

Follow these steps every time you want to open and test the app.

---

## Step 1 — Open Two Terminal Windows

You need **two terminals open at the same time** — one for the backend, one for the frontend. Both must stay running while you use the app.

---

## Step 2 — Start the Backend (Terminal 1)

```
cd "c:\Users\ja373\OneDrive\Documents\Capstone EA\expert-advisor\server"
node server.js
```

You should see:

```
Server running on port 3001
```

A yellow warning about SQLite being "experimental" is normal — ignore it.

**Leave this terminal open.**

---

## Step 3 — Start the Frontend (Terminal 2)

Open a second terminal, then run:

```
cd "c:\Users\ja373\OneDrive\Documents\Capstone EA\expert-advisor\client"
npm run dev
```

You should see something like:

```
  VITE v5.x.x  ready in 300ms

  ➜  Local:   http://localhost:5173/
```

**Leave this terminal open.**

---

## Step 4 — Open the App

Go to your browser and visit:

```
http://localhost:5173
```

---

## Step 5 — Log In

### Test accounts (already in the database):

| Role    | Email                | Password    |
|---------|----------------------|-------------|
| Student | student1@mdc.edu     | password123 |
| Advisor | advisor1@mdc.edu     | password123 |
| Faculty | faculty1@mdc.edu     | password123 |

Or click **Student → Create Account** to make a new account.

---

## Stopping the App

Press **Ctrl + C** in each terminal to stop the backend and frontend.

---

## Troubleshooting

### "Cannot connect" or blank page
- Make sure both `node server.js` AND `npm run dev` are running.
- Check that you're at `http://localhost:5173` (not 3001).

### Something looks broken after a code change
- Stop and restart both terminals using the commands in Steps 2 and 3.

### Database is corrupted or you want a fresh start
Run these commands in Terminal 1:

```
cd "c:\Users\ja373\OneDrive\Documents\Capstone EA\expert-advisor\server"
rm expert-advisor.db
node seed.js
node server.js
```

This deletes the database and recreates it with 500 students and the 3 test accounts.

### Port already in use error
Another process is using port 3001 or 5173. Restart your computer, then try again.

---

## Quick Reference

| What              | Command                          | Terminal |
|-------------------|----------------------------------|----------|
| Start backend     | `node server.js`                 | 1        |
| Start frontend    | `npm run dev`                    | 2        |
| Open app          | http://localhost:5173            | Browser  |
| Reset database    | `rm expert-advisor.db && node seed.js` | 1   |
| Run algo tests    | `node tests/algorithm.test.js`   | 1        |
