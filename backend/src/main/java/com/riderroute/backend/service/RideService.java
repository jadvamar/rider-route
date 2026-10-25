package com.riderroute.backend.service;

import com.riderroute.backend.dto.CreateRideRequest;
import com.riderroute.backend.dto.JoinRideRequest;
import com.riderroute.backend.dto.LocationUpdateRequest;
import com.riderroute.backend.dto.UpdateRideRequest;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.model.RideStatus;
import com.riderroute.backend.model.RiderSession;
import com.riderroute.backend.repository.RideRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
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
        ride.setDistanceMeters(request.getDistanceMeters());
        ride.setDurationSeconds(request.getDurationSeconds());
        ride.setStatus(RideStatus.WAITING);
        ride.setCreatedAt(Instant.now());
        ride.setCode(generateCode());
        return rideRepository.save(ride);
    }

    public Ride updateRide(String rideId, UpdateRideRequest request) {
        Ride ride = getRideById(rideId);
        if (!request.getUserId().equals(ride.getLeaderId())) {
            throw new SecurityException("Only the ride leader can edit this ride");
        }
        if (ride.getStatus() == RideStatus.COMPLETED) {
            throw new IllegalArgumentException("Completed rides cannot be edited");
        }
        ride.setName(request.getName());
        ride.setStartLocation(request.getStartLocation());
        ride.setDestination(request.getDestination());
        ride.setStartAddress(request.getStartAddress());
        ride.setDestAddress(request.getDestAddress());
        ride.setRoute(request.getRoute());
        ride.setDistanceMeters(request.getDistanceMeters());
        ride.setDurationSeconds(request.getDurationSeconds());
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

    public List<Ride> listRidesByUser(String userId) {
        return rideRepository.findAll().stream()
                .filter(ride -> ride.getHiddenFor() == null || !ride.getHiddenFor().contains(userId))
                .filter(ride -> userId.equals(ride.getLeaderId())
                        || ride.getRiders().stream().anyMatch(rider -> userId.equals(rider.getUserId())))
                .toList();
    }

    /** Removes the ride from this user's history only, without deleting the stored ride. */
    public void hideRideForUser(String rideId, String userId) {
        Ride ride = getRideById(rideId);
        Set<String> members = new HashSet<>();
        if (ride.getLeaderId() != null) {
            members.add(ride.getLeaderId());
        }
        ride.getRiders().forEach(rider -> members.add(rider.getUserId()));
        if (!members.contains(userId)) {
            throw new IllegalArgumentException("Ride not found in your history");
        }
        Set<String> hidden = ride.getHiddenFor() == null ? new HashSet<>() : new HashSet<>(ride.getHiddenFor());
        hidden.add(userId);
        ride.getRiders().stream()
                .filter(rider -> userId.equals(rider.getUserId()))
                .forEach(rider -> {
                    rider.setLeft(true);
                    rider.forgetLocation();
                });
        ride.setHiddenFor(hidden);
        rideRepository.save(ride);
    }

    public Ride joinRide(String rideId, JoinRideRequest request) {
        Ride ride = getRideById(rideId);
        if (ride.getStatus() == RideStatus.COMPLETED) {
            throw new IllegalArgumentException("Completed rides cannot be joined");
        }
        // Re-joining a ride brings it back into this rider's history.
        if (ride.getHiddenFor() != null && ride.getHiddenFor().contains(request.getUserId())) {
            Set<String> hidden = new HashSet<>(ride.getHiddenFor());
            hidden.remove(request.getUserId());
            ride.setHiddenFor(hidden);
        }
        RiderSession existing = ride.getRiders().stream()
                .filter(r -> r.getUserId().equals(request.getUserId()))
                .findFirst()
                .orElse(null);
        if (existing != null) {
            // Re-joining after removing the ride from history starts sharing location again.
            existing.setLeft(false);
            existing.setClosed(false);
            existing.setClosedAt(null);
            if (request.getLocation() != null) {
                existing.setLocation(request.getLocation());
                existing.setOnline(true);
                existing.setLastUpdate(Instant.now());
            }
        } else {
            RiderSession rider = new RiderSession();
            rider.setLocation(request.getLocation());
            rider.setUserId(request.getUserId());
            rider.setUserName(request.getUserName());
            rider.setAvatar(request.getAvatar());
            rider.setLeader(request.isLeader());
            rider.setOnline(true);
            rider.setOnRoute(true);
            rider.setLastUpdate(Instant.now());
            rider.setRouteFollowed(new ArrayList<>());
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
        if (rider.isClosed() || rider.isLeft()) {
            return ride;
        }

        rider.setLocation(request.getLocation());
        rider.setHeading(request.getHeading());
        rider.setSpeed(request.getSpeed());
        rider.setOnRoute(request.isOnRoute());
        rider.setOnline(true);
        rider.setLastUpdate(Instant.now());
        List<com.riderroute.backend.model.LatLng> trail = rider.getRouteFollowed() == null
                ? new ArrayList<>()
                : new ArrayList<>(rider.getRouteFollowed());
        if (trail.size() >= 100) {
            trail = new ArrayList<>(trail.subList(trail.size() - 99, trail.size()));
        }
        trail.add(request.getLocation());
        rider.setRouteFollowed(trail);

        return rideRepository.save(ride);
    }

    /** Closes the ride for one non-leader rider only; the ride keeps going for everyone else. */
    public Ride closeRideForRider(String rideId, String userId) {
        Ride ride = getRideById(rideId);
        if (userId.equals(ride.getLeaderId())) {
            throw new IllegalArgumentException("The leader ends the ride for everyone instead");
        }
        RiderSession rider = ride.getRiders().stream()
                .filter(r -> userId.equals(r.getUserId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Rider not found in ride"));
        if (!rider.isClosed()) {
            rider.setClosed(true);
            rider.setClosedAt(Instant.now());
            rider.forgetLocation();
            ride = rideRepository.save(ride);
        }
        return ride;
    }

    public Ride updateRideStatus(String rideId, RideStatus status) {
        Ride ride = getRideById(rideId);
        ride.setStatus(status);
        return rideRepository.save(ride);
    }

    public Ride triggerSOS(String rideId, String userId, String userName, com.riderroute.backend.model.LatLng location) {
        Ride ride = getRideById(rideId);
        ride.setActiveSOS(new com.riderroute.backend.model.SOSAlert(userId, userName, location, System.currentTimeMillis()));
        return rideRepository.save(ride);
    }

        public Ride alertWrongRoute(String rideId, String targetUserId, String fromUserId) {
        Ride ride = getRideById(rideId);
        if (ride.getStatus() != RideStatus.ACTIVE) {
            throw new IllegalArgumentException("Alerts can only be sent during an ongoing ride");
        }
        RiderSession sender = ride.getRiders().stream()
            .filter(rider -> rider.getUserId().equals(fromUserId) && !rider.isClosed() && !rider.isLeft())
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Sender is not active in this ride"));
        RiderSession target = ride.getRiders().stream()
            .filter(rider -> rider.getUserId().equals(targetUserId) && !rider.isClosed() && !rider.isLeft())
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Rider is not active in this ride"));
        target.setWrongRouteAlert(new com.riderroute.backend.model.WrongRouteAlert(
            UUID.randomUUID().toString(), sender.getUserId(), sender.getUserName(), System.currentTimeMillis()));
        return rideRepository.save(ride);
        }

    public Ride cancelSOS(String rideId, String userId) {
        Ride ride = getRideById(rideId);
        // Only allow the user who triggered SOS to cancel it
        if (ride.getActiveSOS() != null && ride.getActiveSOS().getUserId().equals(userId)) {
            ride.setActiveSOS(null);
            return rideRepository.save(ride);
        }
        return ride;
    }

    private String generateCode() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
    }
}
