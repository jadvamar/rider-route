package com.riderroute.backend.repository;

import com.riderroute.backend.model.Ride;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface RideRepository extends MongoRepository<Ride, String> {
    Optional<Ride> findByCode(String code);
}
