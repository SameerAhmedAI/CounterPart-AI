# Deployment

Counterpart has two deployable services:

- Backend: FastAPI app in `backend/`
- Frontend: Vite/React app in `frontend/`

The backend reads secrets and deployment settings from platform environment variables. A local `.env` file is optional for development only and is not required in production.

## Backend environment variables

Set these on Railway or Render:

```text
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
FRONTEND_ORIGINS=https://your-vercel-app.vercel.app
```

`FRONTEND_ORIGINS` accepts a comma-separated list if you need more than one production frontend URL. Local development origins `http://localhost:5173` and `http://127.0.0.1:5173` are allowed by default.

## Frontend environment variables

Set this on Vercel:

```text
VITE_API_URL=https://your-backend-service.example.com
```

Use the public Railway or Render backend URL. Do not include a trailing slash.

## Deploy backend to Railway

1. Create a new Railway project from the GitHub repository.
2. Set the service root directory to `backend`.
3. Configure the start command:

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```

4. Add the backend environment variables listed above.
5. Deploy the service.
6. Confirm the health check returns OK:

   ```text
   GET https://your-railway-service.up.railway.app/api/health
   ```

   Expected response:

   ```json
   {"status":"ok"}
   ```

## Deploy backend to Render

1. Create a new Render Web Service from the GitHub repository.
2. Set the root directory to `backend`.
3. Use Python as the runtime.
4. Set the build command:

   ```bash
   pip install -r requirements.txt
   ```

5. Set the start command:

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```

6. Add the backend environment variables listed above.
7. Deploy the service.
8. Confirm:

   ```text
   GET https://your-render-service.onrender.com/api/health
   ```

## Deploy frontend to Vercel

1. Create a new Vercel project from the GitHub repository.
2. Set the project root directory to `frontend`.
3. Use the default Vite settings:

   ```text
   Build Command: npm run build
   Output Directory: dist
   Install Command: npm install
   ```

4. Add the frontend environment variable:

   ```text
   VITE_API_URL=https://your-backend-service.example.com
   ```

5. Deploy the frontend.
6. Copy the deployed Vercel URL.
7. Update the backend `FRONTEND_ORIGINS` value to include that Vercel URL.
8. Redeploy or restart the backend so the CORS setting is active.

## Local development

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

For local development, the frontend can omit `VITE_API_URL` and use the Vite proxy in `vite.config.js`, or set `VITE_API_URL=http://127.0.0.1:8000`.
