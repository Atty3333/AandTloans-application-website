const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export const TEST_USER_ID = '0a1b2c3d-1111-4222-8333-444455556666';

export const validPayload = {
  fullName: 'Thato  Moeng',
  dob: '2001-04-12',
  idNumber: '123411234',
  phone: '71 234 567',
  email: 'Thato@Example.com',
  address: 'Plot 123, Gaborone',
  institution: 'University of Botswana',
  income: '1500',
  loanAmount: '150',
  loanPurpose: 'Tuition shortfall',
  kinName: 'Mpho Moeng',
  kinRelationship: 'Mother',
  kinId: '234561234',
  kinPhone: '+26772345678',
  kinAltPhone: '',
  kinAddress: 'Plot 9, Francistown',
  guarantorName: '',
  guarantorPhone: '',
  consent: true,
  signatureDataUrl: PNG_1x1,
  documents: {
    bank_statement: `${TEST_USER_ID}/bank_statement-aaaaaaaa.pdf`,
    omang_front: `${TEST_USER_ID}/omang_front-bbbbbbbb.jpg`,
    omang_back: `${TEST_USER_ID}/omang_back-cccccccc.jpg`,
    registration_letter: `${TEST_USER_ID}/registration_letter-dddddddd.pdf`,
    student_id: `${TEST_USER_ID}/student_id-eeeeeeee.png`,
  },
};

