# Rider Route

The frontend and backend are separate applications:

```text
rider-route/
  frontend/          Vite + React app, frontend configs, tests, and package files
    src/
    public/
    .env             Local frontend environment settings (not committed)
    package.json
  backend/           Spring Boot + MongoDB app and Maven files
    src/
    pom.xml
  package.json       Convenience scripts that forward to frontend/
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:8080`.

Keep `VITE_API_BASE_URL` and other frontend environment settings in `frontend/.env`.
The existing local environment file was moved there unchanged. Backend settings
stay in `backend` and are not affected by this folder split.

After installing frontend dependencies, the existing commands also work from the
repository root: `npm run dev`, `npm run build`, and `npm test`.

### Frontend checks

```bash
cd frontend
npm test
npm run build
```

### SOS notifications

Other riders see one notification per SOS event, with one alert sound.
The **Cancel** button dismisses the notification for the receiving rider only;
it does not cancel the sender's active SOS. Polling does not reopen a dismissed
notification while the ride view remains open. A new SOS event is shown again.

### Ride distance and time

- The selected route's distance (meters) and duration (seconds) are saved with
  each new ride and displayed in Recent Rides and the ride-code preview.
- Entering a code opens a preview with the ride name, start, destination, total
  distance, and estimated time. Joining requires a separate **Join Ride** action.
- The live ride's bottom panel shows each rider's own GPS-based remaining
  distance along the selected route and proportional estimated travel time.
  Estimates do not include live traffic or stops; off-route distance includes
  the direct distance back to the selected route, not a newly calculated detour.
- Older rides without saved totals use route geometry and a 30 km/h estimate,
  explicitly marked approximate. Missing route or GPS data is shown as unavailable
  or waiting rather than displaying a misleading zero.
- Restart the backend after updating so new ride totals are persisted in MongoDB.

## Backend (Spring Boot + MongoDB)

Prerequisites:
- Java 17+
- Maven 3.9+
- MongoDB (local or Docker)

### Start MongoDB with Docker

```bash
cd backend
docker compose up -d
```

### Run backend

**Windows (no global Maven install):** use the Maven Wrapper from the `backend` folder:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

**If `mvn` is on your PATH:** you can still use:

```bash
cd backend
mvn spring-boot:run
```

You need **JDK 17+** and `JAVA_HOME` set. On Windows, `mvnw.cmd` requires `JAVA_HOME` (not only `java` on `PATH`). Example after installing a JDK:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"   # adjust to your install path
.\mvnw.cmd spring-boot:run
```

Backend API base URL: `http://localhost:8083/api`

## Backend API endpoints

- `POST /api/auth/signup` - create account and return JWT
- `POST /api/auth/login` - login and return JWT
- `GET /api/auth/me` - get user profile from JWT

- `POST /api/rides` - create ride
- `GET /api/rides` - list rides
- `GET /api/rides/user/{userId}` - list rides where user is leader or joiner
- `GET /api/rides/{rideId}` - get ride by id
- `GET /api/rides/by-code/{code}` - get ride by join code
- `POST /api/rides/{rideId}/join` - join ride
- `PATCH /api/rides/{rideId}/riders/{userId}/location` - update rider location
- `PATCH /api/rides/{rideId}/status?status=ACTIVE` - update ride status (`WAITING`, `ACTIVE`, `COMPLETED`)

JWT login session duration is controlled by:
- `JWT_EXPIRATION_DAYS` (default `30`)
