export interface AuthenticatedRequestUser {
  userId: number;
  username: string;
  email: string;
  accessLevel: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  cognitoSub: string;
}
