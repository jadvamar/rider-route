package com.riderroute.backend.controller;

import com.riderroute.backend.dto.CreateRideRequest;
import com.riderroute.backend.dto.JoinRideRequest;
import com.riderroute.backend.dto.LocationUpdateRequest;
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

    @GetMapping("/{rideId}")
    public Ride getById(@PathVariable String rideId) {
        return rideService.getRideById(rideId);
    }

    @GetMapping("/by-code/{code}")
    public Ride getByCode(@PathVariable String code) {
        return rideService.getRideByCode(code);
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

    @PatchMapping("/{rideId}/status")
    public Ride updateStatus(@PathVariable String rideId, @RequestParam RideStatus status) {
        return rideService.updateRideStatus(rideId, status);
    }
}
