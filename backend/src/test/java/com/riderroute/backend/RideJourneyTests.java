package com.riderroute.backend;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.riderroute.backend.dto.CreateRideRequest;
import com.riderroute.backend.model.Ride;
import com.riderroute.backend.repository.RideRepository;
import com.riderroute.backend.service.RideService;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RideJourneyTests {

    @Test
    void selectedRouteTotalsSurviveCreationAndSerialization() throws Exception {
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        CreateRideRequest request = mapper.readValue("""
                {"name":"Trip","leaderId":"leader",
                 "startLocation":{"lat":12,"lng":77},"destination":{"lat":13,"lng":78},
                 "startAddress":"Start","destAddress":"Finish",
                 "route":[{"lat":12,"lng":77},{"lat":13,"lng":78}],
                 "distanceMeters":125000,"durationSeconds":9000}
                """, CreateRideRequest.class);
        RideRepository repository = mock(RideRepository.class);
        when(repository.save(any(Ride.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Ride saved = new RideService(repository).createRide(request);
        assertEquals(125000.0, saved.getDistanceMeters());
        assertEquals(9000.0, saved.getDurationSeconds());
        var json = mapper.readTree(mapper.writeValueAsString(saved));
        assertEquals(125000.0, json.get("distanceMeters").asDouble());
        assertEquals(9000.0, json.get("durationSeconds").asDouble());
        verify(repository).save(saved);
    }

    @Test
    void routeTotalsAreOptionalForOlderClientsButCannotBeNegative() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            CreateRideRequest request = new CreateRideRequest();
            assertTrue(validator.validateProperty(request, "distanceMeters").isEmpty());
            assertTrue(validator.validateProperty(request, "durationSeconds").isEmpty());
            request.setDistanceMeters(-1.0);
            request.setDurationSeconds(-1.0);
            assertFalse(validator.validateProperty(request, "distanceMeters").isEmpty());
            assertFalse(validator.validateProperty(request, "durationSeconds").isEmpty());
        }
    }
}
