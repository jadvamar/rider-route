package com.riderroute.backend.service;

import com.riderroute.backend.dto.CreateRideRequest;
import com.riderroute.backend.dto.JoinRideRequest;
import com.riderroute.backend.dto.LocationUpdateRequest;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.model.RideStatus;
import com.riderroute.backend.model.RiderSession;
import com.riderroute.backend.repository.RideRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class RideService {

    private final RideRepository rideRepository;

    public RideService(RideRepository rideRepository) {
        this.rideRepository = rideRepository;
    }

    public Ride createRide(CreateRideRequest request) {
        Ride ride = new Ride();
        ride.setName(request.getName());
        ride.setLeaderId(request.getLeaderId());
        ride.setStartLocation(request.getStartLocation());
        ride.setDestination(request.getDestination());
        ride.setStartAddress(request.getStartAddress());
        ride.setDestAddress(request.getDestAddress());
        ride.setRoute(request.getRoute());
        ride.setStatus(RideStatus.WAITING);
        ride.setCreatedAt(Instant.now());
        ride.setCode(generateCode());
        return rideRepository.save(ride);
    }

    public Ride getRideById(String rideId) {
        return rideRepository.findById(rideId).orElseThrow(() -> new IllegalArgumentException("Ride not found"));
    }

    public Ride getRideByCode(String code) {
        return rideRepository.findByCode(code).orElseThrow(() -> new IllegalArgumentException("Ride not found"));
    }

    public List<Ride> listRides() {
        return rideRepository.findAll();
    }

    public Ride joinRide(String rideId, JoinRideRequest request) {
        Ride ride = getRideById(rideId);
        boolean exists = ride.getRiders().stream().anyMatch(r -> r.getUserId().equals(request.getUserId()));
        if (!exists) {
            RiderSession rider = new RiderSession();
            rider.setUserId(request.getUserId());
            rider.setUserName(request.getUserName());
            rider.setAvatar(request.getAvatar());
            rider.setLeader(request.isLeader());
            rider.setOnline(true);
            rider.setOnRoute(true);
            rider.setLastUpdate(Instant.now());
            rider.setRouteFollowed(List.of());
            ride.getRiders().add(rider);
        }
        return rideRepository.save(ride);
    }

    public Ride updateLocation(String rideId, String userId, LocationUpdateRequest request) {
        Ride ride = getRideById(rideId);
        RiderSession rider = ride.getRiders().stream()
                .filter(r -> r.getUserId().equals(userId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Rider not found in ride"));

        rider.setLocation(request.getLocation());
        rider.setHeading(request.getHeading());
        rider.setSpeed(request.getSpeed());
        rider.setOnRoute(request.isOnRoute());
        rider.setOnline(true);
        rider.setLastUpdate(Instant.now());
        if (rider.getRouteFollowed().size() >= 100) {
            rider.setRouteFollowed(rider.getRouteFollowed().subList(rider.getRouteFollowed().size() - 99, rider.getRouteFollowed().size()));
        }
        rider.getRouteFollowed().add(request.getLocation());

        return rideRepository.save(ride);
    }

    public Ride updateRideStatus(String rideId, RideStatus status) {
        Ride ride = getRideById(rideId);
        ride.setStatus(status);
        return rideRepository.save(ride);
    }

    private String generateCode() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
    }
}
