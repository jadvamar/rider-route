package com.riderroute.backend.controller;

import com.riderroute.backend.dto.CreateRideRequest;
import com.riderroute.backend.dto.JoinRideRequest;
import com.riderroute.backend.dto.LocationUpdateRequest;
import com.riderroute.backend.dto.TriggerSOSRequest;
import com.riderroute.backend.dto.UpdateRideRequest;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.model.RideStatus;
import com.riderroute.backend.service.RideService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rides")
public class RideController {

    private final RideService rideService;

    public RideController(RideService rideService) {
        this.rideService = rideService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Ride create(@Valid @RequestBody CreateRideRequest request) {
        return rideService.createRide(request);
    }

    @GetMapping
    public List<Ride> list() {
        return rideService.listRides();
    }

    @GetMapping("/user/{userId}")
    public List<Ride> listByUser(@PathVariable String userId) {
        return rideService.listRidesByUser(userId);
    }

    @DeleteMapping("/user/{userId}/history/{rideId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFromHistory(@PathVariable String userId, @PathVariable String rideId) {
        rideService.hideRideForUser(rideId, userId);
    }

    @GetMapping("/{rideId}")
    public Ride getById(@PathVariable String rideId) {
        return rideService.getRideById(rideId);
    }

    @GetMapping("/by-code/{code}")
    public Ride getByCode(@PathVariable String code) {
        return rideService.getRideByCode(code);
    }

    @PutMapping("/{rideId}")
    public Ride update(@PathVariable String rideId, @Valid @RequestBody UpdateRideRequest request) {
        return rideService.updateRide(rideId, request);
    }

    @PostMapping("/{rideId}/join")
    public Ride join(@PathVariable String rideId, @Valid @RequestBody JoinRideRequest request) {
        return rideService.joinRide(rideId, request);
    }

    @PatchMapping("/{rideId}/riders/{userId}/location")
    public Ride updateLocation(
            @PathVariable String rideId,
            @PathVariable String userId,
            @Valid @RequestBody LocationUpdateRequest request
    ) {
        return rideService.updateLocation(rideId, userId, request);
    }

    @PostMapping("/{rideId}/riders/{userId}/close")
    public Ride closeForRider(@PathVariable String rideId, @PathVariable String userId) {
        return rideService.closeRideForRider(rideId, userId);
    }

    @PatchMapping("/{rideId}/status")
    public Ride updateStatus(@PathVariable String rideId, @RequestParam RideStatus status) {
        return rideService.updateRideStatus(rideId, status);
    }

    @PostMapping("/{rideId}/sos")
    public Ride triggerSOS(@PathVariable String rideId, @Valid @RequestBody TriggerSOSRequest request) {
        return rideService.triggerSOS(rideId, request.getUserId(), request.getUserName(), request.getLocation());
    }

    @PostMapping("/{rideId}/sos/cancel")
    public Ride cancelSOS(@PathVariable String rideId, @Valid @RequestBody TriggerSOSRequest request) {
        return rideService.cancelSOS(rideId, request.getUserId());
    }
}
