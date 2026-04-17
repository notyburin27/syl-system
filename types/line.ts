export interface LineImage {
  id: string
  imageUrl: string
  senderId: string
  senderDisplayName: string
  groupId: string
  groupName: string
  sentAt: string
  messageId: string
  createdAt: string
}

export interface LineSender {
  senderId: string
  senderDisplayName: string
}

export interface LineGroup {
  groupId: string
  groupName: string
}
