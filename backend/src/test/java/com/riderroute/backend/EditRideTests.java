package com.riderroute.backend;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.riderroute.backend.dto.UpdateRideRequest;
import com.riderroute.backend.model.LatLng;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.model.RideStatus;
import com.riderroute.backend.model.RiderSession;
import com.riderroute.backend.repository.RideRepository;
import com.riderroute.backend.service.RideService;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class EditRideTests {

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    private Ride existingRide(RideStatus status) {
        Ride ride = new Ride();
        ride.setId("ride-1");
        ride.setCode("ABC123");
        ride.setLeaderId("leader");
        ride.setName("Old name");
        ride.setStartLocation(new LatLng(12, 77));
        ride.setDestination(new LatLng(13, 78));
        ride.setRoute(List.of(new LatLng(12, 77), new LatLng(13, 78)));
        ride.setStatus(status);
        RiderSession rider = new RiderSession();
        rider.setUserId("rider");
        ride.setRiders(new ArrayList<>(List.of(rider)));
        return ride;
    }

    private UpdateRideRequest edit(String userId) throws Exception {
        return mapper.readValue("""
                {"userId":"%s","name":"New name",
                 "startLocation":{"lat":18.5,"lng":73.8},"destination":{"lat":19.0,"lng":72.8},
                 "startAddress":"Pune","destAddress":"Mumbai",
                 "route":[{"lat":18.5,"lng":73.8},{"lat":18.7,"lng":73.4},{"lat":19.0,"lng":72.8}],
                 "distanceMeters":150000,"durationSeconds":7000}
                """.formatted(userId), UpdateRideRequest.class);
    }

    private RideRepository repoFor(Ride ride) {
        RideRepository repository = mock(RideRepository.class);
        when(repository.findById("ride-1")).thenReturn(Optional.of(ride));
        when(repository.save(any(Ride.class))).thenAnswer(invocation -> invocation.getArgument(0));
        return repository;
    }

    @Test
    void leaderCanEditRideDetailsAndKeepsCodeAndRiders() throws Exception {
        Ride ride = existingRide(RideStatus.ACTIVE);

        Ride updated = new RideService(repoFor(ride)).updateRide("ride-1", edit("leader"));

        assertEquals("New name", updated.getName());
        assertEquals("Mumbai", updated.getDestAddress());
        assertEquals(18.5, updated.getStartLocation().lat());
        assertEquals(3, updated.getRoute().size());
        assertEquals(150000, updated.getDistanceMeters());
        assertEquals(7000, updated.getDurationSeconds());
        assertEquals("ABC123", updated.getCode());
        assertEquals("leader", updated.getLeaderId());
        assertEquals(1, updated.getRiders().size());
        assertEquals(RideStatus.ACTIVE, updated.getStatus());
    }

    @Test
    void otherRidersCannotEdit() throws Exception {
        Ride ride = existingRide(RideStatus.WAITING);
        RideRepository repository = repoFor(ride);

        assertThrows(SecurityException.class, () -> new RideService(repository).updateRide("ride-1", edit("rider")));
        verify(repository, never()).save(any());
        assertEquals("Old name", ride.getName());
    }

    @Test
    void completedRidesCannotBeEdited() throws Exception {
        Ride ride = existingRide(RideStatus.COMPLETED);
        RideRepository repository = repoFor(ride);

        assertThrows(IllegalArgumentException.class, () -> new RideService(repository).updateRide("ride-1", edit("leader")));
        verify(repository, never()).save(any());
    }
}
