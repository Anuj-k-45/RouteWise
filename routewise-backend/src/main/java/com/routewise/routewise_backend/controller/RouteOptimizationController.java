
package com.routewise.routewise_backend.controller;

import com.routewise.routewise_backend.dto.RouteOptimizationRequest;
import com.routewise.routewise_backend.dto.RouteOptimizationResponse;
import com.routewise.routewise_backend.service.RouteOptimizationService;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/routes")
@CrossOrigin(origins = {
        "http://localhost:5173",
        "http://localhost:5174"
})
public class RouteOptimizationController {

    private final RouteOptimizationService routeOptimizationService;

    public RouteOptimizationController(
            RouteOptimizationService routeOptimizationService) {
        this.routeOptimizationService = routeOptimizationService;
    }

    @PostMapping("/optimize")
    public ResponseEntity<RouteOptimizationResponse> optimizeRoute(
            @Valid @RequestBody RouteOptimizationRequest request) {

        RouteOptimizationResponse response = routeOptimizationService.optimizeRoute(request);

        return ResponseEntity.ok(response);
    }
}
