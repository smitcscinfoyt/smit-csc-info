import { useAdminGetPayments, getAdminGetPaymentsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function AdminPayments() {
  const { data: payments, isLoading } = useAdminGetPayments({
    query: { queryKey: getAdminGetPaymentsQueryKey() }
  });

  if (isLoading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="flex-1 p-4 md:p-8 container mx-auto">
      <h1 className="text-2xl font-bold mb-6">Payment History</h1>
      
      <div className="border rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Txn ID</TableHead>
              <TableHead>User ID</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments?.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-mono text-xs">{payment.transactionId}</TableCell>
                <TableCell>{payment.userId}</TableCell>
                <TableCell className="font-bold">₹{payment.amount}</TableCell>
                <TableCell>{payment.plan}</TableCell>
                <TableCell>
                  <Badge 
                    variant={payment.status === 'SUCCESS' ? 'default' : 'destructive'}
                    className={payment.status === 'SUCCESS' ? 'bg-green-500' : ''}
                  >
                    {payment.status}
                  </Badge>
                </TableCell>
                <TableCell>{format(new Date(payment.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
