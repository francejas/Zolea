package com.zolea.backend.repositories;

import com.zolea.backend.models.Client;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ClientRepository extends JpaRepository<Client, Long> {

    // El perfil de un cliente incluye el resumen de sus reservas, y de cada una el identificador de
    // la unidad: sin esto, listar clientes era una consulta por cliente más otra por reserva.
    @Override
    @EntityGraph(attributePaths = {"bookings", "bookings.rentalUnit"})
    List<Client> findAll();

    @Override
    @EntityGraph(attributePaths = {"bookings", "bookings.rentalUnit"})
    Optional<Client> findById(Long id);

    // Metodo personalizado: Spring Boot automáticamente arma la consulta SQL
    // "SELECT * FROM client WHERE email = ?" solo con leer el nombre de este metodoo
    Optional<Client> findByEmail(String email);

    Optional<Client> findByPhone(String phone);

    Optional<Client> findByDni(String dni);

    /** Los administradores de balneario: la lista de balnearios de la cuenta de Zolea dice quién lleva cada uno. */
    List<Client> findByManagedResortIsNotNull();

}