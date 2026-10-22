
package com.routewise.routewise_backend.dto;

import com.routewise.routewise_backend.model.DeliveryPoint;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public class RouteOptimizationRequest {

    @NotEmpty(message = "At least one delivery point is required")
    @Valid
    private List<@NotNull DeliveryPoint> points;

    public RouteOptimizationRequest() {
    }

    public List<DeliveryPoint> getPoints() {
        return points;
    }

    public void setPoints(List<DeliveryPoint> points) {
        this.points = points;
    }
}
