import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /**
   * Crear un nuevo usuario
   * @concept Junior - CRUD básico con validaciones
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    // Verificar si el email ya existe
    const existingUser = await this.usersRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Crear nueva instancia de usuario
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    // Guardar en base de datos
    return await this.usersRepository.save(user);
  }

  /**
   * Obtener todos los usuarios
   * @concept Junior - Query simple
   */
  async findAll(): Promise<User[]> {
    return await this.usersRepository.find({
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Obtener un usuario por ID
   * @concept Junior - Query con manejo de errores
   */
  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['tasks'], // Eager loading de relaciones
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return user;
  }

  /**
   * Buscar usuario por email (usado en autenticación)
   * @concept Mid-Level - Query específica para auth
   */
  async findByEmail(email: string): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password', 'firstName', 'lastName', 'role', 'isActive'],
    });
  }

  /**
   * Actualizar usuario
   * @concept Junior/Mid - Update con validaciones
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // Si se intenta actualizar el email, verificar que no exista
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.usersRepository.findOne({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('El email ya está en uso');
      }
    }

    // Actualizar campos
    Object.assign(user, updateUserDto);

    return await this.usersRepository.save(user);
  }

  /**
   * Eliminar usuario (soft delete)
   * @concept Mid-Level - Soft delete en lugar de hard delete
   */
  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    
    // Desactivar usuario en lugar de eliminarlo
    user.isActive = false;
    await this.usersRepository.save(user);
  }

  /**
   * Cambiar contraseña
   * @concept Mid-Level - Operación específica con validación
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar contraseña antigua
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Contraseña actual incorrecta');
    }

    // Hashear nueva contraseña
    user.password = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);
  }

  /**
   * Obtener estadísticas del usuario
   * @concept Senior - Queries complejas con agregaciones
   */
  async getUserStats(userId: string) {
    const user = await this.findOne(userId);

    const stats = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoin('user.tasks', 'task')
      .where('user.id = :userId', { userId })
      .select('COUNT(task.id)', 'totalTasks')
      .addSelect(
        'COUNT(CASE WHEN task.status = :completed THEN 1 END)',
        'completedTasks',
      )
      .addSelect(
        'COUNT(CASE WHEN task.status = :pending THEN 1 END)',
        'pendingTasks',
      )
      .setParameter('completed', 'completed')
      .setParameter('pending', 'pending')
      .getRawOne();

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: `${user.firstName} ${user.lastName}`,
      },
      stats: {
        totalTasks: parseInt(stats.totalTasks) || 0,
        completedTasks: parseInt(stats.completedTasks) || 0,
        pendingTasks: parseInt(stats.pendingTasks) || 0,
      },
    };
  }
}