package com.riderroute.backend;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.riderroute.backend.dto.JoinRideRequest;
import com.riderroute.backend.dto.LocationUpdateRequest;
import com.riderroute.backend.model.LatLng;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.repository.RideRepository;
import com.riderroute.backend.service.RideService;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RiderLocationTests {

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    private Ride rideAt(LatLng start, LatLng dest) {
        Ride ride = new Ride();
        ride.setId("ride-1");
        ride.setStartLocation(start);
        ride.setDestination(dest);
        ride.setRiders(new ArrayList<>());
        return ride;
    }

    private RideService serviceFor(Ride ride) {
        RideRepository repository = mock(RideRepository.class);
        when(repository.findById("ride-1")).thenReturn(Optional.of(ride));
        when(repository.save(any(Ride.class))).thenAnswer(invocation -> invocation.getArgument(0));
        return new RideService(repository);
    }

    @Test
    void joiningStoresTheRidersOwnLocationAndLeavesRouteEndpointsUnchanged() throws Exception {
        LatLng start = new LatLng(12, 77);
        LatLng dest = new LatLng(13, 78);
        Ride ride = rideAt(start, dest);
        JoinRideRequest join = mapper.readValue("""
                {"userId":"rider","userName":"Rider","location":{"lat":19.07,"lng":72.87}}
                """, JoinRideRequest.class);

        Ride joined = serviceFor(ride).joinRide("ride-1", join);

        var rider = joined.getRiders().get(0);
        assertEquals(19.07, rider.getLocation().lat());
        assertEquals(72.87, rider.getLocation().lng());
        assertSame(start, joined.getStartLocation());
        assertSame(dest, joined.getDestination());
    }

    @Test
    void locationUpdatesWorkRightAfterJoining() throws Exception {
        Ride ride = rideAt(null, null);
        RideService service = serviceFor(ride);
        service.joinRide("ride-1", mapper.readValue("""
                {"userId":"rider","userName":"Rider"}
                """, JoinRideRequest.class));
        LocationUpdateRequest update = mapper.readValue("""
                {"location":{"lat":19.1,"lng":72.9}}
                """, LocationUpdateRequest.class);

        Ride updated = service.updateLocation("ride-1", "rider", update);

        var rider = updated.getRiders().get(0);
        assertEquals(19.1, rider.getLocation().lat());
        assertEquals(1, rider.getRouteFollowed().size());
    }
}

