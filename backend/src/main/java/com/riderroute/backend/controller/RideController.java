package com.riderroute.backend.controller;

import com.riderroute.backend.dto.CreateRideRequest;
import com.riderroute.backend.dto.JoinRideRequest;
import com.riderroute.backend.dto.LocationUpdateRequest;
import com.riderroute.backend.dto.TriggerSOSRequest;
import com.riderroute.backend.dto.UpdateRideRequest;
import com.riderroute.backend.dto.AuthResponse;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.model.RideStatus;
import com.riderroute.backend.service.RideService;
import com.riderroute.backend.service.AuthService;
import io.jsonwebtoken.JwtException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.beans.BeanUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/rides")
public class RideController {

    private final RideService rideService;
    private final AuthService authService;

    public RideController(RideService rideService, AuthService authService) {
        this.rideService = rideService;
        this.authService = authService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Ride create(@Valid @RequestBody CreateRideRequest request, @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireUser(user(authorization), request.getLeaderId());
        return rideService.createRide(request);
    }

    @GetMapping
    public List<Ride> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        String userId = user(authorization).id();
        return rideService.listRidesByUser(userId).stream().map(ride -> visibleRide(ride, userId)).toList();
    }

    @GetMapping("/user/{userId}")
    public List<Ride> listByUser(@PathVariable String userId, @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireUser(user(authorization), userId);
        return rideService.listRidesByUser(userId).stream().map(ride -> visibleRide(ride, userId)).toList();
    }

    @DeleteMapping("/user/{userId}/history/{rideId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFromHistory(@PathVariable String userId, @PathVariable String rideId, @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireUser(user(authorization), userId);
        rideService.hideRideForUser(rideId, userId);
    }

    @GetMapping("/{rideId}")
    public Ride getById(@PathVariable String rideId, @RequestHeader(value = "Authorization", required = false) String authorization) {
        String userId = user(authorization).id();
        return visibleRide(requireMember(rideId, userId), userId);
    }

    @GetMapping("/by-code/{code}")
    public Ride getByCode(@PathVariable String code, @RequestHeader(value = "Authorization", required = false) String authorization) {
        String userId = user(authorization).id();
        return visibleRide(rideService.getRideByCode(code), userId);
    }

    @PutMapping("/{rideId}")
    public Ride update(@PathVariable String rideId, @Valid @RequestBody UpdateRideRequest request, @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireUser(user(authorization), request.getUserId());
        return rideService.updateRide(rideId, request);
    }

    @PostMapping("/{rideId}/join")
    public Ride join(@PathVariable String rideId, @Valid @RequestBody JoinRideRequest request, @RequestHeader(value = "Authorization", required = false) String authorization) {
        AuthResponse.UserProfile profile = user(authorization);
        requireUser(profile, request.getUserId());
        request.setUserName(profile.name());
        request.setLeader(profile.id().equals(rideService.getRideById(rideId).getLeaderId()));
        return visibleRide(rideService.joinRide(rideId, request), profile.id());
    }

    @PatchMapping("/{rideId}/riders/{userId}/location")
    public Ride updateLocation(
            @PathVariable String rideId,
            @PathVariable String userId,
            @Valid @RequestBody LocationUpdateRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        requireUser(user(authorization), userId);
        return visibleRide(rideService.updateLocation(rideId, userId, request), userId);
    }

    @PostMapping("/{rideId}/riders/{userId}/close")
    public Ride closeForRider(@PathVariable String rideId, @PathVariable String userId, @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireUser(user(authorization), userId);
        return visibleRide(rideService.closeRideForRider(rideId, userId), userId);
    }

    @PatchMapping("/{rideId}/status")
    public Ride updateStatus(@PathVariable String rideId, @RequestParam RideStatus status, @RequestHeader(value = "Authorization", required = false) String authorization) {
        AuthResponse.UserProfile profile = user(authorization);
        if (!profile.id().equals(rideService.getRideById(rideId).getLeaderId())) {
            throw new SecurityException("Only the ride leader can change ride status");
        }
        return rideService.updateRideStatus(rideId, status);
    }

    @PostMapping("/{rideId}/sos")
    public Ride triggerSOS(@PathVariable String rideId, @Valid @RequestBody TriggerSOSRequest request, @RequestHeader(value = "Authorization", required = false) String authorization) {
        AuthResponse.UserProfile profile = user(authorization);
        requireUser(profile, request.getUserId());
        requireActiveMember(rideId, profile.id());
        return rideService.triggerSOS(rideId, profile.id(), profile.name(), request.getLocation());
    }

    @PostMapping("/{rideId}/riders/{userId}/wrong-route-alert")
    public Ride alertWrongRoute(@PathVariable String rideId, @PathVariable String userId, @RequestParam String fromUserId, @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireUser(user(authorization), fromUserId);
        return rideService.alertWrongRoute(rideId, userId, fromUserId);
    }

    @PostMapping("/{rideId}/sos/cancel")
    public Ride cancelSOS(@PathVariable String rideId, @Valid @RequestBody TriggerSOSRequest request, @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireUser(user(authorization), request.getUserId());
        requireMember(rideId, request.getUserId());
        return visibleRide(rideService.cancelSOS(rideId, request.getUserId()), request.getUserId());
    }

    private Ride visibleRide(Ride ride, String userId) {
        if (ride == null || ride.getStatus() != RideStatus.WAITING || userId.equals(ride.getLeaderId())) return ride;
        Ride visible = new Ride();
        BeanUtils.copyProperties(ride, visible);
        visible.setRiders(List.of());
        visible.setActiveSOS(null);
        return visible;
    }

    private AuthResponse.UserProfile user(String authorization) {
        try {
            return authService.getProfile(authorization);
        } catch (JwtException | IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please sign in again");
        }
    }

    private void requireUser(AuthResponse.UserProfile profile, String userId) {
        if (!profile.id().equals(userId)) {
            throw new SecurityException("You can only perform this action for yourself");
        }
    }

    private Ride requireMember(String rideId, String userId) {
        Ride ride = rideService.getRideById(rideId);
        if (!userId.equals(ride.getLeaderId()) && ride.getRiders().stream().noneMatch(rider -> userId.equals(rider.getUserId()))) {
            throw new SecurityException("You are not a member of this ride");
        }
        return ride;
    }

    private void requireActiveMember(String rideId, String userId) {
        Ride ride = requireMember(rideId, userId);
        if (ride.getStatus() != RideStatus.ACTIVE || ride.getRiders().stream()
                .noneMatch(rider -> userId.equals(rider.getUserId()) && !rider.isClosed() && !rider.isLeft())) {
            throw new SecurityException("You are not active in this ride");
        }
    }
}
