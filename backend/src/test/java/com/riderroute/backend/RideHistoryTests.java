package com.riderroute.backend;

import com.riderroute.backend.dto.JoinRideRequest;
import com.riderroute.backend.model.LatLng;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.model.RiderSession;
import com.riderroute.backend.repository.RideRepository;
import com.riderroute.backend.service.RideService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RideHistoryTests {

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    private RiderSession rider(String id) {
        RiderSession rider = new RiderSession();
        rider.setUserId(id);
        rider.setUserName(id);
        return rider;
    }

    private Ride sharedRide() {
        Ride ride = new Ride();
        ride.setId("ride-1");
        ride.setLeaderId("leader");
        ride.setStartLocation(new LatLng(12, 77));
        ride.setRiders(new ArrayList<>(List.of(rider("leader"), rider("rider"))));
        return ride;
    }

    private RideRepository repoFor(Ride ride) {
        RideRepository repository = mock(RideRepository.class);
        when(repository.findById("ride-1")).thenReturn(Optional.of(ride));
        when(repository.findAll()).thenReturn(List.of(ride));
        when(repository.save(any(Ride.class))).thenAnswer(invocation -> invocation.getArgument(0));
        return repository;
    }

    @Test
    void riderRemovingARideOnlyHidesItForThemselves() {
        Ride ride = sharedRide();
        RideService service = new RideService(repoFor(ride));

        service.hideRideForUser("ride-1", "rider");

        assertTrue(service.listRidesByUser("rider").isEmpty());
        assertEquals(1, service.listRidesByUser("leader").size());
        assertEquals(2, ride.getRiders().size(), "ride members are untouched");
    }

    @Test
    void leaderRemovingARideKeepsItForOtherRiders() {
        Ride ride = sharedRide();
        RideService service = new RideService(repoFor(ride));

        service.hideRideForUser("ride-1", "leader");

        assertTrue(service.listRidesByUser("leader").isEmpty());
        assertEquals(1, service.listRidesByUser("rider").size());
        assertEquals("leader", ride.getLeaderId());
    }

    @Test
    void usersCannotRemoveRidesTheyAreNotPartOf() {
        Ride ride = sharedRide();
        RideRepository repository = repoFor(ride);

        assertThrows(IllegalArgumentException.class,
                () -> new RideService(repository).hideRideForUser("ride-1", "stranger"));
        verify(repository, never()).save(any());
    }

    @Test
    void joiningAgainBringsTheRideBackIntoHistory() throws Exception {
        Ride ride = sharedRide();
        RideService service = new RideService(repoFor(ride));
        service.hideRideForUser("ride-1", "rider");

        service.joinRide("ride-1", mapper.readValue("""
                {"userId":"rider","userName":"rider"}
                """, JoinRideRequest.class));

        assertEquals(1, service.listRidesByUser("rider").size());
    }

    @Test
    void rideIsRetainedWhenEveryMemberHasRemovedIt() {
        Ride ride = sharedRide();
        RideRepository repository = repoFor(ride);
        RideService service = new RideService(repository);

        service.hideRideForUser("ride-1", "rider");
        verify(repository, never()).delete(any());

        service.hideRideForUser("ride-1", "leader");
        verify(repository, never()).delete(any());
        verify(repository, times(2)).save(ride);
        assertTrue(service.listRidesByUser("rider").isEmpty());
        assertTrue(service.listRidesByUser("leader").isEmpty());
        assertTrue(ride.getRiders().stream().allMatch(RiderSession::isLeft));
        assertSame(ride, service.getRideById("ride-1"));
    }

    @Test
    void leaderWhoIsNotInRiderListStillCountsAsAMember() {
        Ride ride = sharedRide();
        ride.setRiders(new ArrayList<>(List.of(rider("rider"))));
        RideRepository repository = repoFor(ride);
        RideService service = new RideService(repository);

        service.hideRideForUser("ride-1", "rider");

        verify(repository, never()).delete(any());
        assertEquals(1, service.listRidesByUser("leader").size());
    }

    @Test
    void soloRideIsRetainedWhenItsOnlyMemberRemovesIt() {
        Ride ride = sharedRide();
        ride.setRiders(new ArrayList<>(List.of(rider("leader"))));
        RideRepository repository = repoFor(ride);

        new RideService(repository).hideRideForUser("ride-1", "leader");

        verify(repository, never()).delete(any());
        verify(repository).save(ride);
        assertTrue(ride.getHiddenFor().contains("leader"));
        assertTrue(ride.getRiders().get(0).isLeft());
    }

    @Test
    void rideWithZeroRidersIsRetainedWhenCreatorRemovesItFromHistory() {
        Ride ride = sharedRide();
        ride.setRiders(new ArrayList<>());
        RideRepository repository = repoFor(ride);
        RideService service = new RideService(repository);

        service.hideRideForUser("ride-1", "leader");

        verify(repository, never()).delete(any());
        verify(repository).save(ride);
        assertTrue(service.listRidesByUser("leader").isEmpty());
        assertSame(ride, service.getRideById("ride-1"));
    }

    @Test
    void hiddenListIsNotSentToClients() throws Exception {
        Ride ride = sharedRide();
        new RideService(repoFor(ride)).hideRideForUser("ride-1", "rider");

        String json = mapper.writeValueAsString(ride);

        assertFalse(json.contains("hiddenFor"));
    }
}
