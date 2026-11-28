package com.zolea.backend.repositories;

import com.zolea.backend.models.ResortPhoto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * Las fotos de los balnearios.
 *
 * <p>Salvo {@link #findInResort}, que es para mostrar una, ninguna consulta carga la imagen: listar,
 * contar, ordenar y borrar trabajan con los ids.
 */
@Repository
public interface ResortPhotoRepository extends JpaRepository<ResortPhoto, Long> {

    /** Las fotos de esos balnearios, en su orden, en una sola consulta para todo un listado. */
    @Query("SELECT new com.zolea.backend.repositories.ResortPhotoRef(p.idPhoto, p.resort.idResort) "
            + "FROM ResortPhoto p WHERE p.resort.idResort IN :resortIds "
            + "ORDER BY p.position, p.idPhoto")
    List<ResortPhotoRef> findRefsByResortIds(@Param("resortIds") Collection<Long> resortIds);

    @Query("SELECT COUNT(p) FROM ResortPhoto p WHERE p.resort.idResort = :resortId")
    long countByResort(@Param("resortId") Long resortId);

    /** La posición más alta del balneario, o -1 si no tiene fotos: las nuevas van después. */
    @Query("SELECT COALESCE(MAX(p.position), -1) FROM ResortPhoto p WHERE p.resort.idResort = :resortId")
    int findMaxPosition(@Param("resortId") Long resortId);

    /** Una foto, solo si es de ese balneario: la de otro responde igual que una que no existe. */
    @Query("SELECT p FROM ResortPhoto p WHERE p.idPhoto = :photoId AND p.resort.idResort = :resortId")
    Optional<ResortPhoto> findInResort(@Param("photoId") Long photoId, @Param("resortId") Long resortId);

    /** Borra la foto si es de ese balneario. Devuelve cuántas borró: 0 o 1. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM ResortPhoto p WHERE p.idPhoto = :photoId AND p.resort.idResort = :resortId")
    int deleteInResort(@Param("photoId") Long photoId, @Param("resortId") Long resortId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE ResortPhoto p SET p.position = :position WHERE p.idPhoto = :photoId")
    void updatePosition(@Param("photoId") Long photoId, @Param("position") int position);
}
