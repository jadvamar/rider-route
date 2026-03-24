# Rider Route

Frontend is a Vite + React app. A new Spring Boot + MongoDB backend has been added in `backend`.

## Frontend

```bash
npm install
npm run dev
```

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

```bash
cd backend
mvn spring-boot:run
```

Backend API base URL: `http://localhost:8080/api`

## Backend API endpoints

- `POST /api/rides` - create ride
- `GET /api/rides` - list rides
- `GET /api/rides/{rideId}` - get ride by id
- `GET /api/rides/by-code/{code}` - get ride by join code
- `POST /api/rides/{rideId}/join` - join ride
- `PATCH /api/rides/{rideId}/riders/{userId}/location` - update rider location
- `PATCH /api/rides/{rideId}/status?status=ACTIVE` - update ride status (`WAITING`, `ACTIVE`, `COMPLETED`)
